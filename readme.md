# ✨ Gemini Image Generator

A simple web app that lets you generate AI images using **Google Gemini API** and download them directly.

---

## 🚀 Features

- Enter a text prompt to generate an image
- Display generated image in the browser
- One-click **Download** button for saving the image
- Example prompts for inspiration
- Responsive, modern UI with gradient background

---

## 📂 Project Structure

NANO_BANANA/
│── man/
│ ├── images/ # Saved images (if using Node.js server)
│ ├── node_modules/ # Dependencies
│ ├── .env # API key stored here
│ ├── index.html # Frontend (browser UI)
│ ├── man.js # Backend script (Node.js)
│ ├── package.json # Project metadata
│ └── package-lock.json

yaml
Copy code

---

## ⚙️ Setup

### 1. Clone the repo

```bash
git clone https://github.com/your-username/gemini-image-generator.git
cd gemini-image-generator/man
2. Install dependencies
bash
Copy code
npm install
3. Add your API Key
Create a .env file inside man/ with:

env
Copy code
GOOGLE_API_KEY=your_api_key_here
4. Run backend server
bash
Copy code
npm start
This starts the Node.js server on http://localhost:3000.

5. Open frontend
Just open index.html in your browser.
(or serve with Live Server in VS Code for convenience)

📸 Usage
Type your image description in the input box

Click Generate

Wait for the AI to create the image

Click ⬇️ Download Image to save it

🛠️ Tech Stack
Frontend: HTML, CSS, JavaScript

Backend: Node.js (Fetch + Express API endpoint)

AI: Google Gemini API
```
