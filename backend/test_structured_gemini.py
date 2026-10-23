from dotenv import load_dotenv
from google import genai
from pydantic import BaseModel, Field
import os

load_dotenv()

class Reply(BaseModel):
    reply: str = Field(min_length=1)

api_key = os.getenv("GEMINI_API_KEY")
model = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")

print("API key loaded:", bool(api_key))
print("Model:", model)

if not api_key:
    raise SystemExit("GEMINI_API_KEY is missing")

try:
    client = genai.Client(api_key=api_key)

    response = client.models.generate_content(
        model=model,
        contents="Reply with exactly: OK",
        config={
            "response_mime_type": "application/json",
            "response_schema": Reply,
        },
    )

    print("Structured response:", response.text)

except Exception as error:
    print("ERROR TYPE:", type(error).__name__)
    print("ERROR:", error)
