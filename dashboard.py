import streamlit as st
import pandas as pd
import numpy as np

# Set dashboard title
st.set_page_config(page_title="Energy Portal Dashboard", layout="wide")
st.title("⚡ Energy Retail Dashboard")

# Create tab layout
tabs = st.tabs(["💰 Pricing", "📑 Billing", "📝 Enrollments", "🧾 Collections"])

# ========== 💰 Pricing Tab ==========
with tabs[0]:
    st.header("💰 Pricing Overview")
    st.write("This section displays pricing data or pricing tool output.")
    st.metric("Current Rate", "$0.112 per kWh")
    st.metric("Average Market Rate", "$0.106 per kWh")
    st.line_chart(pd.DataFrame(np.random.rand(30, 1)*0.12 + 0.08, columns=["Rate ($/kWh)"]))

# ========== 📑 Billing Tab ==========
with tabs[1]:
    st.header("📑 Billing Summary")
    st.write("Display billing history, totals, or upload bill data.")
    data = {
        "Month": ["Jan", "Feb", "Mar", "Apr"],
        "Billed Amount ($)": [1200, 1350, 1250, 1480],
        "Paid": [True, True, False, False]
    }
    df = pd.DataFrame(data)
    st.dataframe(df)

# ========== 📝 Enrollments Tab ==========
with tabs[2]:
    st.header("📝 Customer Enrollments")
    st.write("Enrollment data, trends, or checks.")
    enrollment_data = {
        "Customer ID": [1001, 1002, 1003, 1004],
        "Status": ["Active", "Pending", "Active", "Rejected"],
        "Enrollment Date": pd.date_range(start="2024-03-01", periods=4)
    }
    st.table(pd.DataFrame(enrollment_data))

# ========== 🧾 Collections Tab ==========
with tabs[3]:
    st.header("🧾 Past Due Collections")
    st.write("Show overdue bills or payment reminders.")
    collections_data = {
        "Customer": ["Amit", "Sara", "John"],
        "Due ($)": [200, 150, 400],
        "Last Contact": ["2024-05-01", "2024-06-10", "2024-06-01"]
    }
    st.dataframe(pd.DataFrame(collections_data))
