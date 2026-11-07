# Construction RAG Assistant

A construction-focused Retrieval-Augmented Generation (RAG) web app. It answers questions from project documents (architectural specifications) with context-grounded responses from a locally hosted LLM via Ollama.

## Features
- Document-grounded answers retrieved from a vector index
- Local LLM inference with Ollama
- JWT authentication and role-based access control
- Multi-turn chat with a 5-turn sliding-window memory buffer
- Project, document, and chat-history management stored in MongoDB

## Tech Stack
Next.js, Node.js, Express.js, MongoDB, Python, RAG, Vector Index (ChromaDB), Ollama, JWT

## Project Structure
```
client/       Next.js frontend (login and chat pages)
server/       Express REST API (auth, projects, documents, chat)
rag_service/  Python RAG pipeline (ingestion, retrieval, generation)
```

## Setup

### Prerequisites
Node.js, Python, MongoDB, and Ollama installed, with the chat and embedding models pulled in Ollama.

### 1. RAG service
```
cd rag_service
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

### 2. Backend
```
cd server
npm install
```
Copy `.env.example` to `.env` and fill in the values, then run `npm start`.

### 3. Frontend
```
cd client
npm install
npm run dev
```
Open http://localhost:3000.

## Screenshots
Add a screenshot of the chat page here.