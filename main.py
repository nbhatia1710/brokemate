import uvicorn
import requests
import json
from datetime import date, timedelta, datetime
from typing import List, Optional, Literal

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from pydantic import BaseModel, Field
from passlib.context import CryptContext

# --- 1. APPLICATION SETUP ---
app = FastAPI(
    title="Brokemate API",
    description="Backend for the Brokemate personal expense management application.",
    version="1.2.0"
)

# --- 2. CORS MIDDLEWARE ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 3. SECURITY & AUTHENTICATION SETUP ---
SECRET_KEY = "a_very_secret_key_that_should_be_in_an_env_file"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# --- 4. IN-MEMORY DATABASE ---
# This is now structured to support multiple users.
fake_users_db = {}
user_expenses = {}

# Sample data for a test user for easy testing
test_user = "user@example.com"
fake_users_db[test_user] = {
    "username": test_user,
    "full_name": "Test User",
    "email": test_user,
    "hashed_password": pwd_context.hash("password123"),
    "disabled": False,
}
user_expenses[test_user] = [
    {"id": 1, "amount": 250.00, "category": "Food", "description": "Lunch with colleagues", "date": "2025-09-27", "flag": None},
    {"id": 2, "amount": 1200.50, "category": "Shopping", "description": "New headphones", "date": "2025-09-26", "flag": "red"},
    {"id": 3, "amount": 150.00, "category": "Transport", "description": "Metro card recharge", "date": "2025-09-25", "flag": "green"},
]


# --- 5. PYDANTIC MODELS (DATA & USER VALIDATION) ---

# Expense Models
class ExpenseBase(BaseModel):
    amount: float = Field(..., gt=0, description="The expense amount, must be positive.")
    category: str
    description: Optional[str] = None
    date: date

class ExpenseCreate(ExpenseBase):
    pass

class Expense(ExpenseBase):
    id: int
    flag: Optional[Literal['red', 'green']] = None

class FlagUpdate(BaseModel):
    id: int
    flag: Literal['red', 'green']

# User & Token Models
class User(BaseModel):
    username: str

class UserInDB(User):
    hashed_password: str

class UserCreate(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

# AI Models - Note: The frontend will send all expenses for context.
class ChatRequest(BaseModel):
    query: str


# --- 6. AUTHENTICATION HELPER FUNCTIONS ---

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def get_user(db, username: str):
    if username in db:
        user_dict = db[username]
        return UserInDB(**user_dict)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = TokenData(username=username)
    except JWTError:
        raise credentials_exception
    user = get_user(fake_users_db, username=token_data.username)
    if user is None:
        raise credentials_exception
    return user


# --- 7. OLLAMA AI INTEGRATION ---
OLLAMA_API_URL = "http://localhost:11434/api/chat"
MODEL_NAME = "llama3.1"

def call_ollama(prompt: str) -> str:
    try:
        payload = {"model": MODEL_NAME, "messages": [{"role": "user", "content": prompt}], "stream": False}
        response = requests.post(OLLAMA_API_URL, json=payload, timeout=30)
        response.raise_for_status()
        return response.json()['message']['content'].strip()
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="AI service timed out.")
    except requests.exceptions.RequestException:
        raise HTTPException(status_code=503, detail="Could not connect to the AI service.")
    except Exception:
        raise HTTPException(status_code=500, detail="An unexpected AI error occurred.")

# --- 8. API ENDPOINTS ---

# --- AUTHENTICATION ENDPOINTS ---

@app.post("/register", response_model=User, status_code=201, tags=["Authentication"])
def register_user(user: UserCreate):
    """Register a new user."""
    if user.username in fake_users_db:
        raise HTTPException(status_code=400, detail="Username already registered")
    hashed_password = get_password_hash(user.password)
    new_user = UserInDB(username=user.username, hashed_password=hashed_password)
    fake_users_db[user.username] = new_user.model_dump()
    user_expenses[user.username] = []
    return new_user

@app.post("/token", response_model=Token, tags=["Authentication"])
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    """Logs in a user and returns a JWT token."""
    user = get_user(fake_users_db, form_data.username)
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

# --- PROTECTED EXPENSE MANAGEMENT ENDPOINTS ---

@app.get("/expenses", response_model=List[Expense], tags=["Expenses"])
def get_expenses(current_user: User = Depends(get_current_user)):
    """Retrieve all expenses for the current user."""
    user_db = user_expenses.get(current_user.username, [])
    return sorted(user_db, key=lambda x: x['date'], reverse=True)

@app.post("/add-expense", response_model=Expense, status_code=201, tags=["Expenses"])
def add_expense(expense: ExpenseCreate, current_user: User = Depends(get_current_user)):
    """Add a new expense for the current user."""
    user_db = user_expenses.get(current_user.username, [])
    new_id = max((d['id'] for d in user_db), default=0) + 1
    new_expense_data = expense.model_dump()
    new_expense_data.update({"id": new_id, "flag": None})
    new_expense_data['date'] = new_expense_data['date'].isoformat()
    user_db.append(new_expense_data)
    user_expenses[current_user.username] = user_db
    return new_expense_data
    
@app.put("/edit-expense/{expense_id}", response_model=Expense, tags=["Expenses"])
def edit_expense(expense_id: int, expense_update: ExpenseCreate, current_user: User = Depends(get_current_user)):
    """Update an existing expense by its ID for the current user."""
    user_db = user_expenses.get(current_user.username, [])
    for index, item in enumerate(user_db):
        if item["id"] == expense_id:
            updated_data = expense_update.model_dump()
            updated_data['date'] = updated_data['date'].isoformat()
            user_db[index].update(updated_data)
            return user_db[index]
    raise HTTPException(status_code=404, detail="Expense not found")

@app.post("/flag-expense", response_model=Expense, tags=["Expenses"])
def flag_expense(flag_update: FlagUpdate, current_user: User = Depends(get_current_user)):
    """Flag an expense as 'red' or 'green' for the current user."""
    user_db = user_expenses.get(current_user.username, [])
    for item in user_db:
        if item['id'] == flag_update.id:
            item['flag'] = flag_update.flag
            return item
    raise HTTPException(status_code=404, detail="Expense not found")

@app.delete("/delete-expense/{expense_id}", status_code=204, tags=["Expenses"])
def delete_expense(expense_id: int, current_user: User = Depends(get_current_user)):
    """Delete an expense by its ID for the current user."""
    user_db = user_expenses.get(current_user.username, [])
    original_count = len(user_db)
    user_db = [item for item in user_db if item['id'] != expense_id]
    if len(user_db) == original_count:
        raise HTTPException(status_code=404, detail="Expense not found")
    user_expenses[current_user.username] = user_db
    return

# --- PROTECTED AI ENDPOINTS ---

@app.post("/analyze", tags=["AI"])
def analyze_expenses(current_user: User = Depends(get_current_user)):
    """Analyzes the current user's spending habits using Llama 3.1."""
    user_db = user_expenses.get(current_user.username, [])
    if not user_db:
        return {"analysis": "There's no data to analyze. Add some expenses first!"}

    expenses_json = json.dumps(user_db, indent=2)
    prompt = f"""
    You are 'Brokebot', a friendly financial analyst for the "Brokemate" app.
    Analyze the following expenses for a user in India (currency is INR: ₹).

    Expense Data: {expenses_json}

    Provide a concise, helpful summary in a single block of text:
    1. Start with a friendly greeting.
    2. Identify the highest spending category.
    3. Gently point out 'avoidable' expenses (flagged 'red').
    4. Praise 'good' spending (flagged 'green').
    5. Offer one clear, actionable tip based on their habits.
    """
    analysis_result = call_ollama(prompt)
    return {"analysis": analysis_result}

@app.post("/chat", tags=["AI"])
def chat_with_ai(request: ChatRequest, current_user: User = Depends(get_current_user)):
    """Powers the AI chat using Llama 3.1, with the current user's expense data as context."""
    user_db = user_expenses.get(current_user.username, [])
    expenses_json = json.dumps(user_db, indent=2)
    prompt = f"""
    You are 'Brokebot', a friendly AI financial assistant.
    The user's expense data is: {expenses_json}
    The user's question is: "{request.query}"

    Answer the user's question conversationally. Use their expense data to make your answer personal and relevant.
    """
    chat_response = call_ollama(prompt)
    return {"response": chat_response}


# --- This line allows you to run the file directly for testing ---
if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)