# 🤖 Chatbot WebApp (LLaMA 3.2 - 3B Instruct)

An end-to-end chatbot built with **FastAPI**, **JavaScript**, **HTML/CSS**, powered by the **LLaMA 3.2 - 3B Instruct model**.  

The chatbot can work in **two modes**:
- **Offline Mode** → Pure LLaMA-based conversation.  
- **Internet Mode** → When the user checks the *Internet* checkbox, the app performs a **Google Custom Search**, merges results with the **last 5 conversation turns**, and generates a contextual response.  

---

## 🚀 Features
- Frontend: **JavaScript, HTML, CSS** with Internet toggle option  
- Backend: **FastAPI (Python)**  
- Model: **LLaMA 3.2 - 3B Instruct** from Hugging Face  
- Optional **Google Custom Search API** integration  
- Conversation memory (last 5 turns)  
- Dockerized for easy deployment  

---

## ⚡ Model Weights
The model weights (~20GB) are **not included in this repository**.  
You must download them into the project directory:  

### Python Script
```python
from huggingface_hub import snapshot_download

# Downloads model into ./chatbot_webapp/models/llama-3.2-3b-instruct
snapshot_download(
    repo_id="meta-llama/Llama-3.2-3B-Instruct",
    local_dir="chatbot_webapp/models/llama-3.2-3b-instruct"
)

huggingface-cli download meta-llama/Llama-3.2-3B-Instruct \
  --local-dir ./chatbot_webapp/models/llama-3.2-3b-instruct

---

**🌐 Google Custom Search Setup**
For enabling Internet Mode:
Go to Google CSE and create a search engine (set it to search the entire web).
Note down:
api_key → from Google Cloud Console
cx_id → from your CSE dashboard.
Open web_search.py and update the WebSearch class with your credentials:

