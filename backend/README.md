# Recipe Recommendation System (Backend)

## Setup
1) Create MySQL database:
- Open `src/utils/schema.sql` and run it in MySQL (recommended).
- Or just run seed script (it attempts schema creation).

2) Configure `.env`:
Update DB credentials.

## Install & Run
```bash
cd backend
npm install
npm run seed
npm run dev
```

## Train ML Similarities
Train item-item cosine similarities and store them in DB:
```bash
npm run train:reco
```

Optional environment variables in `.env`:
- `USE_ML_RECO=true` to enable ML weighting in recommendations (default is enabled).
- `MODEL_TOP_K=100` number of neighbors stored per recipe during training.
- `MODEL_MIN_SCORE=0.05` minimum cosine similarity saved.

## Default Admin
Email: admin@local.test  
Password: admin123

## API Base
http://localhost:5000
