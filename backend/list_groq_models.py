from dotenv import load_dotenv
from groq import Groq
import os

load_dotenv()

api_key = os.getenv("GROQ_API_KEY")

if not api_key:
    raise SystemExit("GROQ_API_KEY is missing from backend/.env")

client = Groq(api_key=api_key)

print("Models available to this API key:")
for model in client.models.list().data:
    print(model.id)
