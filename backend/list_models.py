from dotenv import load_dotenv
from google import genai
import os

load_dotenv()

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

for model in client.models.list():
    supported = getattr(model, "supported_actions", [])
    if not supported or "generateContent" in supported:
        print(model.name)
