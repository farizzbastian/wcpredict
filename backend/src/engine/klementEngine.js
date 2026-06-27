'use strict';

/**
 * Klement Engine — menghitung 6 Faktor Klement
 * Setiap faktor bernilai +1 untuk pemenang, +0 untuk yang kalah.
 * Total maksimal: 6 poin per tim.
 *
 * Faktor 1 : GDP per kapita
 * Faktor 2 : Populasi + Budaya Sepak Bola
 * Faktor 3 : Suhu Rata-rata Negara (ideal = 14°C)
 * Faktor 4 : Ranking FIFA (lebih kecil = lebih baik)
 * Faktor 5 : Status Tuan Rumah
 * Faktor 6 : Kekuatan WC Form (dari Tournament Stats)
 */

const IDEAL_TEMPERATURE = 14;
const GDP_OPTIMAL_PER_CAPITA = 60_000;

function formatUsd(value) {
  return `$${value.toLocaleString()}`;
}

function calculateGdpDevelopmentScore(gdpPerCapita) {
  if (gdpPerCapita == null) return null;
  if (gdpPerCapita <= GDP_OPTIMAL_PER_CAPITA) {
    return gdpPerCapita / GDP_OPTIMAL_PER_CAPITA;
  }

  const excessRatio = (gdpPerCapita - GDP_OPTIMAL_PER_CAPITA) / GDP_OPTIMAL_PER_CAPITA;
  return Math.max(0.35, 1 - excessRatio * 0.5);
}

function describeGdpScore(teamName, rawGdp, effectiveScore) {
  const base = `${teamName}: ${formatUsd(rawGdp)} per kapita, skor efektivitas ${effectiveScore.toFixed(2)}`;
  if (rawGdp > GDP_OPTIMAL_PER_CAPITA) {
    return `${base}. Di atas ${formatUsd(GDP_OPTIMAL_PER_CAPITA)}, efek ekonomi diberi penalti diminishing return karena minat anak pada aktivitas lain bisa mengurangi basis sepak bola.`;
  }
  return `${base}. Pendapatan ini masih berada di zona investasi yang membantu akademi, fasilitas latihan, dan pengembangan pemain muda.`;
}

/**
 * @param {object} teamA  - data tim dari teams.js
 * @param {object} teamB  - data tim dari teams.js
 * @param {object} statsA - tournament stats tim A
 * @param {object} statsB - tournament stats tim B
 * @returns {object} hasil perhitungan 6 faktor
 */
function calculateKlementFactors(teamA, teamB, statsA, statsB) {
  const factors = [];
  let scoreA = 0;
  let scoreB = 0;

  // --- Faktor 1: GDP per Kapita ---
  const f1 = buildFactor(
    'gdp',
    'GDP per Kapita',
    '💰',
    teamA.gdpPerCapita != null && teamB.gdpPerCapita != null,
    () => {
      const gdpScoreA = calculateGdpDevelopmentScore(teamA.gdpPerCapita);
      const gdpScoreB = calculateGdpDevelopmentScore(teamB.gdpPerCapita);
      const diff = gdpScoreA - gdpScoreB;
      const winA = diff > 0.03;
      const winB = diff < -0.03;
      return {
        winnerA: winA, winnerB: winB, neutral: !winA && !winB,
        valA: `${formatUsd(teamA.gdpPerCapita)} -> ${gdpScoreA.toFixed(2)}`,
        valB: `${formatUsd(teamB.gdpPerCapita)} -> ${gdpScoreB.toFixed(2)}`,
        unit: `efektif, optimal ~${formatUsd(GDP_OPTIMAL_PER_CAPITA)}`,
        detail: winA
          ? `${teamA.name} unggul faktor GDP efektif. ${describeGdpScore(teamA.name, teamA.gdpPerCapita, gdpScoreA)} ${describeGdpScore(teamB.name, teamB.gdpPerCapita, gdpScoreB)}`
          : winB
          ? `${teamB.name} unggul faktor GDP efektif. ${describeGdpScore(teamB.name, teamB.gdpPerCapita, gdpScoreB)} ${describeGdpScore(teamA.name, teamA.gdpPerCapita, gdpScoreA)}`
          : `GDP efektif kedua tim setara. ${describeGdpScore(teamA.name, teamA.gdpPerCapita, gdpScoreA)} ${describeGdpScore(teamB.name, teamB.gdpPerCapita, gdpScoreB)}`,
      };
    }
  );
  factors.push(f1);
  if (f1.winnerA) scoreA++;
  if (f1.winnerB) scoreB++;

  // --- Faktor 2: Populasi + Budaya Sepak Bola ---
  const f2 = buildFactor(
    'football_pop',
    'Populasi + Budaya',
    '⚽',
    teamA.population != null && teamA.footballCultureScore != null &&
    teamB.population != null && teamB.footballCultureScore != null,
    () => {
      // Kombinasi: populasi (bobot kecil) × skor budaya (bobot besar)
      // Normalisasi populasi ke skala 1-10 (max ~1.4M = Brasil)
      const normalizePopulation = (pop) => Math.min(pop / 200_000_000 * 5, 5);
      const compositeA = normalizePopulation(teamA.population) + teamA.footballCultureScore;
      const compositeB = normalizePopulation(teamB.population) + teamB.footballCultureScore;
      const winA = compositeA > compositeB;
      const winB = compositeB > compositeA;
      return {
        winnerA: winA, winnerB: winB, neutral: !winA && !winB,
        valA: `${(teamA.population / 1_000_000).toFixed(1)}M · ${teamA.footballCultureScore}/10`,
        valB: `${(teamB.population / 1_000_000).toFixed(1)}M · ${teamB.footballCultureScore}/10`,
        unit: 'pop + culture',
        detail: winA
          ? `${teamA.name} unggul kombinasi populasi (${(teamA.population/1e6).toFixed(1)}M) dan skor budaya sepak bola (${teamA.footballCultureScore}/10).`
          : winB
          ? `${teamB.name} unggul kombinasi populasi (${(teamB.population/1e6).toFixed(1)}M) dan skor budaya sepak bola (${teamB.footballCultureScore}/10).`
          : 'Kombinasi populasi dan budaya kedua tim setara.',
      };
    }
  );
  factors.push(f2);
  if (f2.winnerA) scoreA++;
  if (f2.winnerB) scoreB++;

  // --- Faktor 3: Suhu Rata-rata (ideal = 14°C) ---
  const f3 = buildFactor(
    'temperature',
    'Suhu Rata-rata',
    '🌡️',
    teamA.avgTemperature != null && teamB.avgTemperature != null,
    () => {
      const diffA = Math.abs(teamA.avgTemperature - IDEAL_TEMPERATURE);
      const diffB = Math.abs(teamB.avgTemperature - IDEAL_TEMPERATURE);
      const winA = diffA < diffB;
      const winB = diffB < diffA;
      return {
        winnerA: winA, winnerB: winB, neutral: !winA && !winB,
        valA: `${teamA.avgTemperature}°C (selisih: ${diffA})`,
        valB: `${teamB.avgTemperature}°C (selisih: ${diffB})`,
        unit: `ideal: ${IDEAL_TEMPERATURE}°C`,
        detail: winA
          ? `${teamA.name} lebih dekat ke suhu ideal ${IDEAL_TEMPERATURE}°C (selisih ${diffA} vs ${diffB}).`
          : winB
          ? `${teamB.name} lebih dekat ke suhu ideal ${IDEAL_TEMPERATURE}°C (selisih ${diffB} vs ${diffA}).`
          : `Kedua tim sama-sama jauh/dekat dari suhu ideal ${IDEAL_TEMPERATURE}°C.`,
      };
    }
  );
  factors.push(f3);
  if (f3.winnerA) scoreA++;
  if (f3.winnerB) scoreB++;

  // --- Faktor 4: Ranking FIFA ---
  const f4 = buildFactor(
    'fifa_rank',
    'Ranking FIFA',
    '🏆',
    teamA.fifaRank != null && teamB.fifaRank != null,
    () => {
      const winA = teamA.fifaRank < teamB.fifaRank;
      const winB = teamB.fifaRank < teamA.fifaRank;
      return {
        winnerA: winA, winnerB: winB, neutral: !winA && !winB,
        valA: `#${teamA.fifaRank}`,
        valB: `#${teamB.fifaRank}`,
        unit: 'angka lebih kecil = lebih baik',
        detail: winA
          ? `${teamA.name} berada di ranking FIFA lebih tinggi (#${teamA.fifaRank} vs #${teamB.fifaRank}).`
          : winB
          ? `${teamB.name} berada di ranking FIFA lebih tinggi (#${teamB.fifaRank} vs #${teamA.fifaRank}).`
          : 'Kedua tim memiliki ranking FIFA yang sama.',
      };
    }
  );
  factors.push(f4);
  if (f4.winnerA) scoreA++;
  if (f4.winnerB) scoreB++;

  // --- Faktor 5: Status Tuan Rumah ---
  const f5 = buildFactor(
    'home_advantage',
    'Keuntungan Tuan Rumah',
    '🏟️',
    true, // selalu tersedia
    () => {
      const winA = teamA.isHost && !teamB.isHost;
      const winB = teamB.isHost && !teamA.isHost;
      return {
        winnerA: winA, winnerB: winB, neutral: !winA && !winB,
        valA: teamA.isHost ? 'Tuan Rumah' : 'Away',
        valB: teamB.isHost ? 'Tuan Rumah' : 'Away',
        unit: 'status',
        detail: winA
          ? `${teamA.name} bermain sebagai tuan rumah — mendapat keuntungan dukungan penonton.`
          : winB
          ? `${teamB.name} bermain sebagai tuan rumah — mendapat keuntungan dukungan penonton.`
          : 'Tidak ada tim yang berstatus tuan rumah — faktor netral.',
      };
    }
  );
  factors.push(f5);
  if (f5.winnerA) scoreA++;
  if (f5.winnerB) scoreB++;

  // --- Faktor 6: WC 2026 Form ---
  const statsAvailable = statsA != null && statsB != null;
  const f6 = buildFactor(
    'wc_form',
    'WC 2026 Form',
    '📊',
    statsAvailable,
    () => {
      if (!statsAvailable) return { winnerA: false, winnerB: false, neutral: true, valA: 'N/A', valB: 'N/A', unit: 'tidak tersedia', detail: 'Data statistik turnamen belum tersedia.' };
      // Skor form: win=3, draw=1, loss=0 + goal diff bonus
      const formScoreA = statsA.wins * 3 + statsA.draws * 1 + statsA.goalDiff * 0.5;
      const formScoreB = statsB.wins * 3 + statsB.draws * 1 + statsB.goalDiff * 0.5;
      const winA = formScoreA > formScoreB;
      const winB = formScoreB > formScoreA;
      const formStr = (s) => `${s.wins}M-${s.draws}S-${s.losses}K`;
      return {
        winnerA: winA, winnerB: winB, neutral: !winA && !winB,
        valA: `${formStr(statsA)} · ${statsA.goalsFor} GF · ${statsA.goalsAgainst} GA`,
        valB: `${formStr(statsB)} · ${statsB.goalsFor} GF · ${statsB.goalsAgainst} GA`,
        unit: 'performa turnamen',
        detail: winA
          ? `${teamA.name} memiliki performa turnamen lebih kuat (form score: ${formScoreA.toFixed(1)} vs ${formScoreB.toFixed(1)}).`
          : winB
          ? `${teamB.name} memiliki performa turnamen lebih kuat (form score: ${formScoreB.toFixed(1)} vs ${formScoreA.toFixed(1)}).`
          : 'Performa turnamen kedua tim setara.',
      };
    }
  );
  factors.push(f6);
  if (f6.winnerA) scoreA++;
  if (f6.winnerB) scoreB++;

  return { factors, scoreA, scoreB, maxScore: 6 };
}

/** Helper: bungkus setiap faktor dengan status data */
function buildFactor(id, name, icon, dataAvailable, computeFn) {
  if (!dataAvailable) {
    return {
      id, name, icon,
      dataStatus: 'missing',
      winnerA: false, winnerB: false, neutral: true, missing: true,
      valA: 'N/A', valB: 'N/A', unit: '', detail: 'Data tidak tersedia untuk faktor ini.',
    };
  }
  const result = computeFn();
  return { id, name, icon, dataStatus: 'available', missing: false, ...result };
}

module.exports = { calculateKlementFactors };
