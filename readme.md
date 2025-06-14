# RAG Ingestion Skeleton  
_A lightweight Next.js + PostgreSQL + Graphile Worker starter_

This repository shows the minimal plumbing needed to **receive Office 365 e-mails as JSON, remove PII, store the sanitized content in PostgreSQL, and enqueue a background job for further processing**.  
It is intended as the entry point for a full Retrieval-Augmented-Generation (RAG) pipeline, but only includes the ingestion+queue skeleton.

---

## Features

| Layer                | What it does                                                                 |
|----------------------|------------------------------------------------------------------------------|
| **Next.js API**      | `POST /api/inpoint` – accepts an array of Office 365 message objects         |
| **PII scrub**        | Masks e-mail addresses & phone numbers before anything is persisted          |
| **Database**         | Tables `emails` (PII-free content) and `pipeline_logs` (per-step trace)       |
| **Job queue**        | Graphile Worker; currently ships with one dummy task                         |
| **TypeScript**       | End-to-end type safety                                                       |

---

## Requirements

* **Node 18+**  
* **PostgreSQL 14+** (any hosted instance is fine)  
* `psql` CLI for running migrations

---

## Quick start

```bash
git clone <your-repo>
cd <your-repo>

# install dependencies
npm install

# add environment variables
cp .env.example .env.local             # edit DATABASE_URL, JWT_SECRET …

# create tables
npm run migrate

# run Next.js dev server (port 3000)
npm run dev

# in a second terminal: run the worker
npm run worker
