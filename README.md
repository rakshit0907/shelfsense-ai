# ShelfSense AI 🛒

> **AI-powered Retail Shelf Monitoring and Inventory Management System**
> Built for the **Google Solution Challenge 2026**

[![Python](https://img.shields.io/badge/Python-3.11-blue)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-green)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61dafb)](https://react.dev)
[![YOLOv8](https://img.shields.io/badge/YOLOv8-Ultralytics-orange)](https://ultralytics.com)
[![Gemini](https://img.shields.io/badge/Google-Gemini_API-4285F4)](https://aistudio.google.com)
[![Cloud Run](https://img.shields.io/badge/GCP-Cloud_Run-4285F4)](https://cloud.google.com/run)

---

## 🎯 Problem Statement

Retailers lose billions annually due to empty shelves, poor inventory tracking, and manual stock checks. Traditional systems rely on human walkthroughs, RFID tags, or weight sensors — expensive, error-prone, and non-real-time.

**ShelfSense AI** solves this with an Enterprise-grade camera + AI-first approach: zero hardware cost, real-time edge detection, and actionable intelligence delivered via a secure dashboard and WhatsApp alerts.

---

## 🏗️ Architecture

```
Camera
 ↓
YOLOv8 Detection + Class Filtering (exclude people/animals/vehicles)
 ↓
Shelf Region Filtering (user-defined bounding box)
 ↓
R×C Grid Mapping (center-point → cell, highest confidence wins)
 ↓
Frame Buffer (N frames, majority voting per cell)
 ↓
Occlusion Guard (skip frames if occupancy drops > 50%)
 ↓
Stable Grid Snapshot (every N seconds)
 ↓
Count-Capped Sales Detection (prev snapshot vs curr snapshot)
 ↓
SQLite Database (sales_events, daily_sales, audit_log)
 ↓
FastAPI REST + WebSocket API
 ↓
React Dashboard (live grid, charts, alerts, sales log)
 ↓
WhatsApp Daily Report (Twilio API)
```

---

## 🧠 Sales Detection Algorithm

The core innovation — **count-capped diff** — eliminates false positives from rearrangements:

```python
# Step 1: Count items
old_counts = count(prev_snapshot)
new_counts = count(curr_snapshot)

# Step 2: Sale cap per item (net reduction only)
sale_cap[item] = old_counts[item] - new_counts[item]  # 0 if rearranged

# Step 3: Find cells where item disappeared
disappearances = [(r, c) for cell that changed from item → empty]

# Step 4: Confirm up to sale_cap only
if sale_cap[item] > 0:
    confirmed_sales = disappearances[:sale_cap]
    # Movement → ignored  ✅
    # Real removal → counted  ✅
    # No false positives  ✅
```

---

## 🟢 Features

| Feature | Description |
|---------|-------------|
| 🔍 YOLOv8 Inference | Production-grade object detection, retail-class filter |
| 📊 Shelf Grid | R×C interactive grid with hover tooltips |
| 🧠 Frame Consensus | Majority voting, occlusion guard, stable grid |
| 📸 Smart Diff | Count-capped sales detection algorithm |
| 📉 Velocity Tracking | Per-item sales rate monitoring |
| 🔔 Smart Alerts | Low stock, out of stock, fast-moving items |
| 🤖 AI Insights | Gemini-powered business intelligence |
| 📱 Automated Reports | Daily enterprise summaries via WhatsApp |
| 🧪 Simulation Mode | Virtual environment for calibration and testing |
| ✏️ Audit Trail | Editable sales log with history + versioning |
| 📈 Analytics Hub | 7/14/30 day predictive trends & distribution |
| ☁️ Enterprise Cloud | Docker + Google Cloud Run architecture |

---

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- Node.js 20+
- (Optional) Gemini API key — [Get free key](https://aistudio.google.com)
- (Optional) Twilio credentials for real WhatsApp

### 1. Clone & Setup Backend

```powershell
cd shelfsense-ai/backend

# Create virtual environment
python -m venv venv
venv\Scripts\activate   # Windows

# Install dependencies
pip install -r requirements.txt

# Configure (copy and edit .env)
copy .env.example .env
# Edit .env with your API keys (optional — works without them in mock mode)

# Run backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Setup Frontend

```powershell
cd shelfsense-ai/frontend

npm install
npm run dev
```

Open: [http://localhost:5173](http://localhost:5173)

### 3. Demo Mode

Click **Start Monitoring** in the dashboard. In demo mode, the system simulates a live shelf with automatic item removal to demonstrate sales detection. No camera required!

---

## 🐳 Docker (Full Stack)

```bash
# From shelfsense-ai/
docker-compose up --build
```

- Backend: http://localhost:8000
- Frontend: http://localhost:3000
- API docs: http://localhost:8000/docs

---

## ☁️ Google Cloud Deployment

### Prerequisites
```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

### Deploy Backend to Cloud Run
```bash
cd shelfsense-ai/backend

gcloud run deploy shelfsense-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8000 \
  --memory 2Gi \
  --set-env-vars APP_MODE=demo,GEMINI_API_KEY=YOUR_KEY
```

### Deploy Frontend to Cloud Run
```bash
cd shelfsense-ai/frontend

# Build with your Cloud Run backend URL
VITE_API_URL=https://YOUR-BACKEND-URL docker build \
  --build-arg VITE_API_URL=https://YOUR-BACKEND-URL \
  --build-arg VITE_WS_URL=wss://YOUR-BACKEND-URL \
  -t gcr.io/YOUR_PROJECT_ID/shelfsense-frontend .

gcloud run deploy shelfsense-frontend \
  --image gcr.io/YOUR_PROJECT_ID/shelfsense-frontend \
  --region us-central1 \
  --allow-unauthenticated
```

### CI/CD with Cloud Build
```bash
gcloud builds submit --config cloudbuild.yaml
```

---

## 📡 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/status` | System health & stats |
| GET | `/api/grid` | Current stable grid |
| GET | `/api/alerts` | Active alerts |
| GET | `/api/insights` | Gemini AI insights |
| GET | `/api/sales` | Sales events (paginated) |
| POST | `/api/sales` | Manual sale entry |
| PUT | `/api/sales/{id}` | Edit sale |
| DELETE | `/api/sales/{id}` | Delete sale |
| GET | `/api/sales/audit` | Audit log |
| GET | `/api/daily-report` | Today's summary |
| GET | `/api/sales/summary` | Multi-day trend |
| POST | `/api/camera/start` | Start monitoring |
| POST | `/api/camera/stop` | Stop monitoring |
| POST | `/api/config` | Update configuration |
| POST | `/api/whatsapp/send` | Send WhatsApp report |
| WS | `/ws/live` | Live updates stream |
| WS | `/ws/camera` | Camera frame stream |

Full interactive docs: `http://localhost:8000/docs`

---

## 🌐 Environment Variables

### Backend (`backend/.env`)
```env
APP_MODE=demo                    # demo | production
GRID_ROWS=4
GRID_COLS=5
SHELF_X1=0.05
SHELF_Y1=0.10
SHELF_X2=0.95
SHELF_Y2=0.90
GEMINI_API_KEY=                  # Google AI Studio key
TWILIO_ACCOUNT_SID=              # Twilio SID
TWILIO_AUTH_TOKEN=               # Twilio token
TWILIO_FROM=whatsapp:+14155238886
TWILIO_TO=whatsapp:+91XXXXXXXXXX
DAILY_REPORT_HOUR=20
DAILY_REPORT_MINUTE=0
```

### Frontend (`frontend/.env`)
```env
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
```

---

## 🧪 Technology Stack

| Layer | Technology |
|-------|-----------|
| AI Detection | YOLOv8 (Ultralytics) |
| AI Insights | Google Gemini 1.5 Flash |
| Backend | Python 3.11, FastAPI, Uvicorn |
| Real-time | WebSockets (native FastAPI) |
| Database | SQLite + aiosqlite (async) |
| Scheduler | APScheduler |
| Messaging | Twilio WhatsApp API |
| Frontend | React 18, Vite, Tailwind CSS v3 |
| Charts | Recharts |
| Routing | React Router v6 |
| Deployment | Docker, Google Cloud Run |
| CI/CD | Google Cloud Build |

---

## 📊 Google Solution Challenge Checklist

- ✅ **Google AI Model**: Gemini 1.5 Flash (insights + vision fallback)
- ✅ **Google Cloud**: Cloud Run deployment (backend + frontend)
- ✅ **Live Prototype**: Cloud Run URL
- ✅ **GitHub Repository**: Public repo with this README
- ✅ **Demo Video**: Demo mode walkthrough (3 min)
- ✅ **UN SDG**: SDG 12 (Responsible Consumption & Production)

---

## 📁 Project Structure

```
shelfsense-ai/
├── backend/
│   ├── config.py           # Settings (demo/production modes)
│   ├── database.py         # SQLite async DB layer
│   ├── detector.py         # YOLOv8 + Gemini Vision fallback
│   ├── grid_mapper.py      # Shelf region + R×C grid mapping
│   ├── tracker.py          # Frame buffer + majority vote + snapshots
│   ├── logic.py            # Sales detection + alerts + insights
│   ├── whatsapp_service.py # Twilio WhatsApp integration
│   ├── main.py             # FastAPI app + WebSocket
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Layout.jsx      # Sidebar + Topbar
│   │   │   ├── ShelfGrid.jsx   # Interactive grid overlay
│   │   │   ├── LiveFeed.jsx    # Camera feed component
│   │   │   └── AlertsPanel.jsx # Dismissible alerts
│   │   ├── hooks/
│   │   │   └── useWebSocket.js # WS lifecycle + auto-reconnect
│   │   ├── lib/
│   │   │   └── api.js          # Axios API client
│   │   └── pages/
│   │       ├── Dashboard.jsx   # Main monitoring page
│   │       ├── SalesLog.jsx    # Editable sales table
│   │       ├── Analytics.jsx   # Charts & trends
│   │       └── Settings.jsx    # Configuration
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── cloudbuild.yaml
└── README.md
```

---

## 📄 License

MIT License — Open source for the Google Solution Challenge community.

---

*Built with ❤️ for Google Solution Challenge 2026*
