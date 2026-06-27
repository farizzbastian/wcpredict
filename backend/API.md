# WC2026 Prediction Engine - API Reference

Base URL: `http://localhost:3001`

Konfigurasi:

```env
FOOTBALL_DATA_API_KEY=your_football_data_api_key
```

---

## Health Check

```http
GET /api/health
```

---

## Matches

### Semua Pertandingan

```http
GET /api/matches
GET /api/matches?status=upcoming
GET /api/matches?status=live
GET /api/matches?status=finished
GET /api/matches?phase=Group Stage
GET /api/matches?group=Group D
```

### Detail Pertandingan

```http
GET /api/matches/:id
```

### Update Live Score Manual

```http
PATCH /api/matches/:id/live-score
```

Body:

```json
{ "scoreA": 1, "scoreB": 0, "minute": 67 }
```

---

## Predictions

### Prediksi Lengkap

```http
GET /api/predictions/:matchId
```

Response mencakup:

- `klementFactors` - 6 Faktor Klement dan skor
- `tournamentStats` - statistik turnamen dan skor. xG, shots, shots on target, possession, kartu, dan suspensi diisi sebagai `derived` dari rata-rata laga WC 2026 yang sudah dimainkan ketika provider tidak memberi statistik resmi.
- `playerRating` - rating pemain/lini. Jika rating pemain individual resmi belum tersedia, rating ditandai `derived` dan dihitung dari performa tim selama WC 2026.
- `squadCondition` - cedera, suspensi, rotasi, dan skor kondisi skuad
- `groupSituation` - motivasi tim dan posisi grup
- `prediction` - hasil akhir, skor, confidence, data status, risk, dan alasan

### Ringkasan Prediksi

```http
GET /api/predictions/:matchId/summary
```

---

## Teams

### Semua Tim

```http
GET /api/teams
```

### Klasemen Semua Grup

```http
GET /api/teams/standings/all
```

### Detail Tim

```http
GET /api/teams/:tla
```

Contoh:

```http
GET /api/teams/POR
```

---

## Response Format

Semua response sukses menggunakan format:

```json
{
  "success": true,
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": 503,
    "message": "Football data provider error 403: ...",
    "type": "PROVIDER_AUTH_FAILED",
    "dataStatus": "missing",
    "providerStatusCode": 403
  }
}
```

---

## Struktur Komponen Prediksi

| Komponen | Max | Keterangan |
|---|---:|---|
| 6 Faktor Klement | 6 | Setiap faktor +1 |
| Statistik Turnamen | 3 | Performa aktual WC2026 |
| Rating Pemain | 3 | Starting XI, pemain kunci, atau estimasi saat data belum tersedia |
| Kondisi Skuad | 2 | Cedera, suspensi, rotasi |
| Situasi Grup | 1 | Motivasi tim |
| **Total** | **15** | |
