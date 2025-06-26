import streamlit as st
import pandas as pd
import numpy as np

# -------------------------------
# 🔐 LOGIN SECTION
# -------------------------------

# Hardcoded credentials (you can load from file or DB later)
USERNAME = "admin"
PASSWORD = "1234"

# Use session state to remember login
if "authenticated" not in st.session_state:
    st.session_state.authenticated = False

def login():
    with st.form("login_form"):
        st.title("🔐 Login")
        username = st.text_input("Username")
        password = st.text_input("Password", type="password")
        submitted = st.form_submit_button("Login")

        if submitted:
            if username == USERNAME and password == PASSWORD:
             st.session_state.authenticated = True
             st.success("Login successful! Loading dashboard...")
             st.rerun()  # 🔁 Force reload to show the dashboard
        else:
         st.error("Invalid credentials. Please try again.")


# If not logged in, show login form
if not st.session_state.authenticated:
    login()
    st.stop()

# -------------------------------
# ✅ MAIN DASHBOARD (AFTER LOGIN)
# -------------------------------

st.set_page_config(page_title="Energy Dashboard", layout="wide")
st.title("⚡ Energy Retail Dashboard")

# Tabs
tabs = st.tabs(["💰 Pricing", "📑 Billing", "📝 Enrollments", "🧾 Collections"])

# 💰 Pricing
with tabs[0]:
    st.header("💰 Pricing")
    st.metric("Current Rate", "$0.112 per kWh")
    st.line_chart(pd.DataFrame(np.random.rand(30, 1)*0.12 + 0.08, columns=["Rate ($/kWh)"]))

# 📑 Billing
with tabs[1]:
    st.header("📑 Billing")
    billing_data = {
        "Month": ["Jan", "Feb", "Mar", "Apr"],
        "Billed Amount ($)": [1200, 1350, 1250, 1480],
        "Paid": [True, True, False, False]
    }
    st.dataframe(pd.DataFrame(billing_data))

# 📝 Enrollments
with tabs[2]:
    st.header("📝 Enrollments")
    enrollment_data = {
        "Customer ID": [1001, 1002, 1003, 1004],
        "Status": ["Active", "Pending", "Active", "Rejected"],
        "Date": pd.date_range(start="2024-03-01", periods=4)
    }
    st.table(pd.DataFrame(enrollment_data))

# 🧾 Collections
with tabs[3]:
    st.header("🧾 Collections")
    collections_data = {
        "Customer": ["Amit", "Sara", "John"],
        "Due ($)": [200, 150, 400],
        "Last Contact": ["2024-05-01", "2024-06-10", "2024-06-01"]
    }
    st.dataframe(pd.DataFrame(collections_data))
