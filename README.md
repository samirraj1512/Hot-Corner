# 🎬 Hot Corner – Full-Stack Movie Ticket Booking Platform

A production-ready movie ticket booking web application built with the **MERN stack**, featuring separate admin and user interfaces, real-time seat booking, ML-based recommendations, and automated email notifications.

🔗 **Live Demo:** [https://hot-corner.vercel.app/](https://hot-corner.vercel.app/)
📁 **GitHub:** [https://github.com/Chinmay-biswas/Hot-Corner](https://github.com/Chinmay-biswas/Hot-Corner)

---

## 📌 Features

### User Side
- Browse movies with real-time data from **TMDB API**
- View movie details, trailers, ratings, and cast
- Select shows, dates, and seats with real-time availability
- Simulated payment flow with booking confirmation
- Automated booking confirmation emails via **Brevo SMTP**
- Personalized movie recommendations using **ML engine**
- Fully responsive across mobile, tablet, and desktop

### Admin Side
- Secure admin dashboard with role-based access
- Full **CRUD operations** for movies, shows, schedules, and seat maps
- Real-time seat availability management
- View and manage all bookings

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React.js, Tailwind CSS, HTML5, CSS3 |
| Backend | Node.js, Express.js |
| Database | MongoDB |
| Authentication | Clerk, OAuth 2.0 |
| Email Service | Brevo SMTP |
| Movie Data | TMDB API |
| ML Engine | TF-IDF Vectorization, Cosine Similarity |
| Deployment | Vercel (Frontend), Render (Backend) |

---

## 🤖 ML Recommendation Engine

Built a **content-based recommendation system** using:
- **TF-IDF Vectorization** on movie metadata (genre, cast, description)
- **Cosine Similarity** to find movies closest to user preferences
- Surfaces personalized suggestions on the homepage and after booking

---

## 🚀 Getting Started

### Prerequisites
- Node.js v18+
- MongoDB (local or Atlas)
- Clerk account
- TMDB API key
- Brevo SMTP credentials

### Installation

```bash
# Clone the repository
git clone https://github.com/Chinmay-biswas/Hot-Corner.git
cd Hot-Corner
```

### Backend Setup

```bash
cd server
npm install
```

Create a `.env` file in `/server`:

```env
MONGODB_URI=your_mongodb_connection_string
CLERK_SECRET_KEY=your_clerk_secret_key
TMDB_API_KEY=your_tmdb_api_key
BREVO_SMTP_USER=your_brevo_email
BREVO_SMTP_PASS=your_brevo_password
PORT=5000
```

```bash
npm run dev
```

### Frontend Setup

```bash
cd client
npm install
```

Create a `.env` file in `/client`:

```env
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
VITE_TMDB_API_KEY=your_tmdb_api_key
VITE_BACKEND_URL=http://localhost:5000
```

```bash
npm run dev
```

---

## 📁 Project Structure

```
Hot-Corner/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Route-level pages
│   │   ├── context/        # Global state management
│   │   └── utils/          # Helper functions
├── server/                 # Node.js backend
│   ├── controllers/        # Route handlers
│   ├── models/             # MongoDB schemas
│   ├── routes/             # API routes
│   ├── middleware/         # Auth & error middleware
│   └── utils/              # Email, ML engine helpers
└── README.md
```

---

## 📸 Screenshots

> Add screenshots of homepage, seat selection, admin dashboard here.

---

## 🙌 Author

**Chinmay Biswas**
- GitHub: [@Chinmay-biswas](https://github.com/Chinmay-biswas)
- LinkedIn: [chinmay-biswas-a8098b298](https://www.linkedin.com/in/chinmay-biswas-a8098b298/)
- Portfolio: [portfoliocjstudio-bw8n.vercel.app](https://portfoliocjstudio-bw8n.vercel.app/)

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
