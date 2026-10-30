# MithaiBook 🪔

**MithaiBook** is a modern SaaS management platform designed specifically for Indian sweet shop owners. It simplifies daily counter sales, inventory tracking, kitchen production, raw material deductions, and business analytics.

## 🚀 Features

- **Dashboard**: Real-time sales total, Cash/UPI/Card breakdown, top-selling sweets, and critical stock alert badges.
- **Counter Stock Management**: Live inventory tracking, quick stock adjustments, and shelf-life expiration alerts.
- **Quick Sale / POS**: Ultra-fast POS billing with multiple payment modes and automatic stock deduction.
- **Kitchen & Raw Materials**: Track ghee, dry fruits, sugar, and milk stock with threshold warnings and delivery logs.
- **Production Batches**: Record kitchen batch preparations with automated raw material ingredient deductions.
- **Supabase Backend**: Real-time database sync, Row Level Security (RLS), and secure multi-tenant shop separation.

## 🛠️ Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Plus Jakarta Sans
- **Backend / Database**: Supabase (PostgreSQL, Realtime, Auth, Storage)

## 📦 Setup & Installation

1. Clone repository:
   ```bash
   git clone https://github.com/Dhruvilgithubrit/Mithai-Book.git
   cd Mithai-Book
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Setup environment variables:
   Copy `.env.example` to `.env` and fill in your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. Run local development server:
   ```bash
   npm run dev
   ```
