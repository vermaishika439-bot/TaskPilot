from dotenv import load_dotenv
from google import genai
import os

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
model = os.getenv("GEMINI_MODEL") or "gemini-3.8-flash"

print("API key loaded:", bool(api_key))
print("Model:", model)

if not api_key:
    raise SystemExit("GEMINI_API_KEY is missing")

try:
    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=model,
        contents="Reply with exactly: OK"
    )
    print("Gemini response:", response.text)
except Exception as error:
    print("ERROR TYPE:", type(error).__name__)
    print("ERROR:", error)
