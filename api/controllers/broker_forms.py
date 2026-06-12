"""
Broker Forms — PDF generation for all 11 document types.
Each function accepts flat params and returns PDF bytes via reportlab.
LOA upload additionally sends an email with the attached file.
"""

from io import BytesIO
from typing import List, Optional
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email.mime.text import MIMEText
from email import encoders

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_doc(buf: BytesIO) -> SimpleDocTemplate:
    return SimpleDocTemplate(
        buf, pagesize=letter,
        leftMargin=0.75 * inch, rightMargin=0.75 * inch,
        topMargin=0.75 * inch, bottomMargin=0.75 * inch,
    )


def _styles():
    return getSampleStyleSheet()


def _header(story, styles, title: str, subtitle: str = "") -> None:
    center = ParagraphStyle("center", parent=styles["Normal"], alignment=TA_CENTER)
    story.append(Paragraph("<b>ORBIC ENERGY</b>", center))
    story.append(Spacer(1, 4))
    story.append(Paragraph(f"<b>{title}</b>", center))
    if subtitle:
        story.append(Paragraph(subtitle, center))
    story.append(Spacer(1, 6))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.black))
    story.append(Spacer(1, 12))


def _kv_rows(pairs: list, styles) -> Table:
    data = []
    for label, value in pairs:
        data.append([
            Paragraph(f"<b>{label}:</b>", styles["Normal"]),
            Paragraph(str(value) if value else "", styles["Normal"]),
        ])
    t = Table(data, colWidths=[2.1 * inch, 4.5 * inch])
    t.setStyle(TableStyle([
        ("VALIGN",         (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING",  (0, 0), (-1, -1), 5),
        ("TOPPADDING",     (0, 0), (-1, -1), 2),
        ("LEFTPADDING",    (0, 0), (-1, -1), 0),
    ]))
    return t


def _section(story, styles, text: str) -> None:
    story.append(Spacer(1, 10))
    story.append(Paragraph(f"<b><u>{text}</u></b>", styles["Normal"]))
    story.append(Spacer(1, 5))


# ---------------------------------------------------------------------------
# LOA
# ---------------------------------------------------------------------------

def generate_loa_pdf(
    date_str: str, expiration_date: str, tdu: str, sent_mail: str,
    esi_nums: List[str], service_addresses: List[str],
    company_name: str, contact_name: str, address: str,
    city_state_zip: str, phone: str, fax: str, email: str,
    printed_name: str, title_: str, auth_date: str,
) -> bytes:
    buf = BytesIO()
    doc = _make_doc(buf)
    st = _styles()
    story = []

    _header(story, st, "LETTER OF AUTHORIZATION")
    story.append(_kv_rows([
        ("Date",             date_str),
        ("Expiration Date",  expiration_date),
        ("TDU / TDSP",       tdu),
        ("Send To",          sent_mail),
    ], st))

    _section(story, st, "Customer Information")
    story.append(_kv_rows([
        ("Company Name",  company_name),
        ("Contact Name",  contact_name),
        ("Address",       address),
        ("City/State/Zip", city_state_zip),
        ("Phone",         phone),
        ("Fax",           fax),
        ("Email",         email),
    ], st))

    _section(story, st, "ESI IDs & Service Addresses")
    esid_data = [["#", "ESI ID", "Service Address"]]
    for i in range(6):
        esi  = esi_nums[i] if i < len(esi_nums) else ""
        addr = service_addresses[i] if i < len(service_addresses) else ""
        if esi or addr:
            esid_data.append([str(i + 1), esi, addr])
    if len(esid_data) > 1:
        etbl = Table(esid_data, colWidths=[0.4 * inch, 2.5 * inch, 3.5 * inch])
        etbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0),  colors.HexColor("#003366")),
            ("TEXTCOLOR",     (0, 0), (-1, 0),  colors.white),
            ("FONTSIZE",      (0, 0), (-1, -1), 9),
            ("GRID",          (0, 0), (-1, -1), 0.5, colors.grey),
            ("TOPPADDING",    (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(etbl)

    story.append(Spacer(1, 20))
    story.append(Paragraph(
        "By signing below, I hereby authorize Orbic Energy to act as our retail "
        "electric provider agent with the above Transmission and Distribution Utility "
        "(TDU) for the above-listed ESIIDs.",
        st["Normal"],
    ))
    story.append(Spacer(1, 20))
    story.append(_kv_rows([
        ("Authorized Signature", "____________________________"),
        ("Printed Name",        printed_name),
        ("Title",               title_),
        ("Date",                auth_date),
    ], st))

    doc.build(story)
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# LOA Upload — email to TDSP
# ---------------------------------------------------------------------------

# TDSP email addresses (override via env vars)
_TDSP_EMAILS = {
    "oncor":       os.getenv("TDSP_EMAIL_ONCOR",       "loa@oncor.com"),
    "centerpoint": os.getenv("TDSP_EMAIL_CENTERPOINT",  "loa@centerpointenergy.com"),
    "aep":         os.getenv("TDSP_EMAIL_AEP",          "loa@aeptexas.com"),
    "tnmp":        os.getenv("TDSP_EMAIL_TNMP",         "loa@tnmp.com"),
}


def send_loa_email(
    tdsp: str, from_email: str, subject: str, comments: str,
    filename: str, file_bytes: bytes,
) -> dict:
    recipient = _TDSP_EMAILS.get(tdsp.lower(), "")
    if not recipient:
        return {"success": False, "message": f"Unknown TDSP: {tdsp}"}

    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "465"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")

    msg = MIMEMultipart()
    msg["From"]    = smtp_user
    msg["To"]      = recipient
    msg["Subject"] = subject

    msg.attach(MIMEText(comments or "Please find the attached LOA.", "plain"))

    part = MIMEBase("application", "octet-stream")
    part.set_payload(file_bytes)
    encoders.encode_base64(part)
    part.add_header("Content-Disposition", f'attachment; filename="{filename}"')
    msg.attach(part)

    try:
        with smtplib.SMTP_SSL(smtp_host, smtp_port) as server:
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, [recipient], msg.as_string())
        return {"success": True, "message": f"LOA emailed to {tdsp.upper()} at {recipient}"}
    except Exception as exc:
        return {"success": False, "message": str(exc)}


# ---------------------------------------------------------------------------
# ACH / Credit Card
# ---------------------------------------------------------------------------

def generate_ach_pdf(
    authorization: bool,
    eff_date: str, card_name: str, card_type: str,
    ccnumber: str, exp_date: str, sec_code: str,
    bill_address: str, billingcsz: str,
    apc_name: str, apa_num: str,
    auth_sig: str, title_: str, prt_name: str, date_: str,
    auth_sig2: str, title2: str, prt_name2: str, date2: str,
    email_add: str, ph_no: str,
) -> bytes:
    buf = BytesIO()
    doc = _make_doc(buf)
    st = _styles()
    story = []

    _header(story, st, "ACH AUTHORIZATION FORM")
    story.append(Paragraph(
        "<b>Authorization to Change Existing:</b> "
        + ("Yes" if authorization else "No"),
        st["Normal"],
    ))
    story.append(Spacer(1, 8))

    _section(story, st, "Credit Card Information")
    story.append(_kv_rows([
        ("Effective Date",      eff_date),
        ("Name on Card",        card_name),
        ("Card Type",           card_type),
        ("Card Number",         ccnumber),
        ("Expiration Date",     exp_date),
        ("Security Code",       sec_code),
        ("Billing Address",     bill_address),
        ("City/State/Zip",      billingcsz),
    ], st))

    _section(story, st, "Customer Information")
    story.append(_kv_rows([
        ("Customer Name",    apc_name),
        ("Account Number",   apa_num),
        ("Email",            email_add),
        ("Phone",            ph_no),
    ], st))

    _section(story, st, "Authorization Signatures")
    story.append(_kv_rows([
        ("Signature 1",  auth_sig or "____________________________"),
        ("Title",        title_),
        ("Printed Name", prt_name),
        ("Date",         date_),
        ("Signature 2",  auth_sig2 or "____________________________"),
        ("Title",        title2),
        ("Printed Name", prt_name2),
        ("Date",         date2),
    ], st))

    doc.build(story)
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# Commercial Contract
# ---------------------------------------------------------------------------

def generate_contract_commercial_pdf(
    date_day: str, date_month: str,
    buyer: str, attn1: str, street1: str, city1: str, zip1: str,
    taxid: str, phone1: str, fax1: str, email1: str,
    attn2: str, street2: str, city2: str, zip2: str,
    phone2: str, fax2: str, email2: str,
    bill: str, spanish: str,
    start_date: str, asapdate: str,
    term_months: str,
    fixedprice: str, lmpplus: str, meterfee: str,
    esid1: str, service_add1: str, citystreet1: str,
    esid2: str, service_add2: str, citystreet2: str,
    esid3: str, service_add3: str, citystreet3: str,
    pname: str, socecurity: str, driverl: str,
    pphone: str, paddress: str,
) -> bytes:
    buf = BytesIO()
    doc = _make_doc(buf)
    st = _styles()
    story = []

    _header(story, st, "COMMERCIAL ELECTRICITY CONTRACT")
    story.append(_kv_rows([
        ("Date",        f"{date_month}/{date_day}"),
        ("Buyer",       buyer),
        ("Start Date",  start_date or asapdate or "ASAP"),
        ("Term",        f"{term_months} months"),
        ("Fixed Price", fixedprice),
        ("LMP+",        lmpplus),
        ("Meter Fee",   meterfee),
        ("Billing",     bill),
        ("Spanish",     spanish),
    ], st))

    _section(story, st, "Service Address (Billing)")
    story.append(_kv_rows([
        ("Attention",  attn1),
        ("Street",     street1),
        ("City",       city1),
        ("Zip",        zip1),
        ("Tax ID",     taxid),
        ("Phone",      phone1),
        ("Fax",        fax1),
        ("Email",      email1),
    ], st))

    _section(story, st, "Service Address (Primary)")
    story.append(_kv_rows([
        ("Attention",  attn2),
        ("Street",     street2),
        ("City",       city2),
        ("Zip",        zip2),
        ("Phone",      phone2),
        ("Fax",        fax2),
        ("Email",      email2),
    ], st))

    _section(story, st, "ESI IDs")
    esid_data = [["ESID", "Service Address", "City/Street"]]
    for eid, svc, cst in [
        (esid1, service_add1, citystreet1),
        (esid2, service_add2, citystreet2),
        (esid3, service_add3, citystreet3),
    ]:
        if eid:
            esid_data.append([eid, svc, cst])
    if len(esid_data) > 1:
        etbl = Table(esid_data, colWidths=[2.0 * inch, 2.5 * inch, 2.0 * inch])
        etbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0),  colors.HexColor("#003366")),
            ("TEXTCOLOR",     (0, 0), (-1, 0),  colors.white),
            ("FONTSIZE",      (0, 0), (-1, -1), 9),
            ("GRID",          (0, 0), (-1, -1), 0.5, colors.grey),
            ("TOPPADDING",    (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(etbl)

    _section(story, st, "Personal Guaranty")
    story.append(_kv_rows([
        ("Name",            pname),
        ("Social Security", socecurity),
        ("Driver's License", driverl),
        ("Phone",           pphone),
        ("Address",         paddress),
    ], st))

    story.append(Spacer(1, 20))
    story.append(_kv_rows([
        ("Customer Signature", "____________________________"),
        ("Date",               ""),
        ("Rep Signature",      "____________________________"),
        ("Date",               ""),
    ], st))

    doc.build(story)
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# Residential Contract
# ---------------------------------------------------------------------------

def generate_contract_residential_pdf(
    date_day: str, date_month: str,
    cname: str, ssecurit: str, driverl: str,
    str_add: str, city_add: str, state: str, zip_: str,
    attn: str, phone: str, bfax: str, email_name: str,
    server_name: str, site_name: str, bill_type: str,
    start_date: str, asap: str,
    term_options: List[str],
    esid1: str, service_add1: str, citystreet1: str,
    esid2: str, service_add2: str, citystreet2: str,
    esid3: str, service_add3: str, citystreet3: str,
    con_price: str, con_term: str,
    signature: str, pname: str, lifesupport: str,
) -> bytes:
    buf = BytesIO()
    doc = _make_doc(buf)
    st = _styles()
    story = []

    _header(story, st, "RESIDENTIAL ELECTRICITY CONTRACT")
    story.append(_kv_rows([
        ("Date",           f"{date_month}/{date_day}"),
        ("Customer Name",  cname),
        ("SSN",            ssecurit),
        ("Driver's License", driverl),
        ("Address",        str_add),
        ("City",           city_add),
        ("State",          state),
        ("Zip",            zip_),
        ("Phone",          phone),
        ("Fax",            bfax),
        ("Email",          email_name),
        ("Server",         server_name),
        ("Site Name",      site_name),
        ("Billing Type",   bill_type),
        ("Start Date",     start_date or asap or "ASAP"),
        ("Term",           ", ".join(term_options) if term_options else ""),
        ("Contract Price", con_price),
        ("Contract Term",  con_term),
        ("Life Support",   lifesupport),
    ], st))

    _section(story, st, "ESI IDs")
    esid_data = [["ESID", "Service Address", "City/Street"]]
    for eid, svc, cst in [
        (esid1, service_add1, citystreet1),
        (esid2, service_add2, citystreet2),
        (esid3, service_add3, citystreet3),
    ]:
        if eid:
            esid_data.append([eid, svc, cst])
    if len(esid_data) > 1:
        etbl = Table(esid_data, colWidths=[2.0 * inch, 2.5 * inch, 2.0 * inch])
        etbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0),  colors.HexColor("#003366")),
            ("TEXTCOLOR",     (0, 0), (-1, 0),  colors.white),
            ("FONTSIZE",      (0, 0), (-1, -1), 9),
            ("GRID",          (0, 0), (-1, -1), 0.5, colors.grey),
            ("TOPPADDING",    (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(etbl)

    story.append(Spacer(1, 20))
    story.append(_kv_rows([
        ("Authorized Signature", signature or "____________________________"),
        ("Printed Name",         pname),
        ("Date",                 ""),
    ], st))

    doc.build(story)
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# Personal Guarantee
# ---------------------------------------------------------------------------

def generate_personal_guarantee_pdf(
    text: str, text1: str, text2: str, text3: str,
    sig: str, p_name: str,
    street_add: str, city_state_zip: str,
    home_ph_no: str, social_security_no: str, driverlno: str,
) -> bytes:
    buf = BytesIO()
    doc = _make_doc(buf)
    st = _styles()
    story = []

    _header(story, st, "PERSONAL GUARANTY")
    story.append(Paragraph(
        "In consideration of and as an inducement to Orbic Energy accepting the above "
        "named Customer as a customer for the supply of electric service, the undersigned "
        "personally guarantees payment of all amounts owed.",
        st["Normal"],
    ))
    story.append(Spacer(1, 12))
    story.append(_kv_rows([
        ("Business Name",     text),
        ("Additional Info 1", text1),
        ("Additional Info 2", text2),
        ("Additional Info 3", text3),
    ], st))

    _section(story, st, "Personal Guarantor Information")
    story.append(_kv_rows([
        ("Full Name",         p_name),
        ("Home Address",      street_add),
        ("City/State/Zip",    city_state_zip),
        ("Home Phone",        home_ph_no),
        ("Social Security #", social_security_no),
        ("Driver's License",  driverlno),
    ], st))

    story.append(Spacer(1, 20))
    story.append(_kv_rows([
        ("Signature", sig or "____________________________"),
        ("Date",      ""),
    ], st))

    doc.build(story)
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# Corporate Guarantee
# ---------------------------------------------------------------------------

def generate_corporate_guarantee_pdf(
    text: str, date_: str, month: str, year: str,
    cname: str, textid: str, phone: str,
    street: str, city: str, state: str, zip_: str,
) -> bytes:
    buf = BytesIO()
    doc = _make_doc(buf)
    st = _styles()
    story = []

    _header(story, st, "CORPORATE GUARANTY")
    story.append(Paragraph(
        "In consideration of and as an inducement to Orbic Energy accepting the above "
        "named Customer as a customer for the supply of electric service, the undersigned "
        "corporation hereby guarantees payment of all amounts owed.",
        st["Normal"],
    ))
    story.append(Spacer(1, 12))
    story.append(_kv_rows([
        ("Company / Business", text),
        ("Date",               f"{month}/{date_}/{year}"),
        ("Corporate Name",     cname),
        ("Tax ID",             textid),
        ("Phone",              phone),
        ("Street",             street),
        ("City",               city),
        ("State",              state),
        ("Zip",                zip_),
    ], st))

    story.append(Spacer(1, 20))
    story.append(_kv_rows([
        ("Authorized Signature", "____________________________"),
        ("Title",               ""),
        ("Date",                ""),
    ], st))

    doc.build(story)
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# Credit Check
# ---------------------------------------------------------------------------

def generate_credit_check_pdf(
    pname: str, sno: str, phone: str, address: str,
    signature: str, date_: str,
) -> bytes:
    buf = BytesIO()
    doc = _make_doc(buf)
    st = _styles()
    story = []

    _header(story, st, "CREDIT CHECK AUTHORIZATION")
    story.append(Paragraph(
        "I hereby authorize Orbic Energy to obtain my credit report for the purpose "
        "of establishing commercial electric service.",
        st["Normal"],
    ))
    story.append(Spacer(1, 12))
    story.append(_kv_rows([
        ("Full Name",         pname),
        ("SSN / Tax ID",      sno),
        ("Phone",             phone),
        ("Address",           address),
        ("Date",              date_),
    ], st))

    story.append(Spacer(1, 20))
    story.append(_kv_rows([
        ("Signature", signature or "____________________________"),
        ("Date",      date_),
    ], st))

    doc.build(story)
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# Account Transfer
# ---------------------------------------------------------------------------

def generate_account_transfer_pdf(
    cust_name: str, acc_name: str, ph_no: str,
    serv_name: str, city_sz: str, req_date: str,
    curr_edate: str, curr_crate: str, notes: str,
    nser_add: str, ncity_sz: str, n_esiid: str,
    n_phone: str, n_req_date: str,
) -> bytes:
    buf = BytesIO()
    doc = _make_doc(buf)
    st = _styles()
    story = []

    _header(story, st, "ACCOUNT TRANSFER REQUEST")
    _section(story, st, "Current Account")
    story.append(_kv_rows([
        ("Customer Name",          cust_name),
        ("Account Name",           acc_name),
        ("Phone",                  ph_no),
        ("Service Name",           serv_name),
        ("City/State/Zip",         city_sz),
        ("Requested Transfer Date", req_date),
        ("Current Contract End Date", curr_edate),
        ("Current Contract Rate",  curr_crate),
        ("Notes",                  notes),
    ], st))

    _section(story, st, "New Service Information")
    story.append(_kv_rows([
        ("New Service Address", nser_add),
        ("City/State/Zip",      ncity_sz),
        ("New ESIID",           n_esiid),
        ("New Phone",           n_phone),
        ("Requested Date",      n_req_date),
    ], st))

    story.append(Spacer(1, 20))
    story.append(_kv_rows([
        ("Customer Signature", "____________________________"),
        ("Date",               ""),
    ], st))

    doc.build(story)
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# Cancellation
# ---------------------------------------------------------------------------

def generate_cancellation_pdf(
    cust_name: str, acc_numb: str, phone_num: str,
    service_add: str, city_st_zip: str, cancell_datea: str,
    con_endate: str, cont_rate: str, coment: str,
    move: bool, switch: bool, other: bool, other_text: str,
    f_address: str, f_cityst_zip: str, f_phone: str, f_email: str,
    final_institution: str, inv_addr: str, rout_no: str, inv_acc: str,
    cr_name: str, cr_no: str, ex_date: str, sec_code: str, inv_add: str,
) -> bytes:
    buf = BytesIO()
    doc = _make_doc(buf)
    st = _styles()
    story = []

    _header(story, st, "CANCELLATION REQUEST")
    story.append(_kv_rows([
        ("Customer Name",          cust_name),
        ("Account Number",         acc_numb),
        ("Phone",                  phone_num),
        ("Service Address",        service_add),
        ("City/State/Zip",         city_st_zip),
        ("Cancellation Date",      cancell_datea),
        ("Contract End Date",      con_endate),
        ("Contract Rate",          cont_rate),
        ("Comments",               coment),
    ], st))

    reasons = []
    if move:    reasons.append("Moving")
    if switch:  reasons.append("Switching Provider")
    if other:   reasons.append(f"Other: {other_text}")
    story.append(_kv_rows([("Reason", ", ".join(reasons))], st))

    _section(story, st, "Forwarding Information")
    story.append(_kv_rows([
        ("Forwarding Address",  f_address),
        ("City/State/Zip",      f_cityst_zip),
        ("Phone",               f_phone),
        ("Email",               f_email),
    ], st))

    _section(story, st, "Refund / Final Payment")
    story.append(_kv_rows([
        ("Financial Institution", final_institution),
        ("Inv. Address",         inv_addr),
        ("Routing Number",       rout_no),
        ("Account Number",       inv_acc),
        ("Inv. Add.",            inv_add),
    ], st))

    if cr_name or cr_no:
        _section(story, st, "Credit Card")
        story.append(_kv_rows([
            ("Name on Card",  cr_name),
            ("Card Number",   cr_no),
            ("Exp. Date",     ex_date),
            ("Security Code", sec_code),
        ], st))

    story.append(Spacer(1, 20))
    story.append(_kv_rows([
        ("Customer Signature", "____________________________"),
        ("Date",               ""),
    ], st))

    doc.build(story)
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# Meter Add
# ---------------------------------------------------------------------------

def generate_meter_add_pdf(
    account_name: str, esiid: str, contract_name: str, phone: str,
    current_contract_end_date: str, rate: str,
    request_types: List[str],
    self_move_date: str, self_select_date: str,
    contract_end_date: str, add_meter_rate: str,
    billing_addr: str, note: str,
    esiid1: str, service_addr1: str, city1: str,
    esiid2: str, service_addr2: str, city2: str,
    esiid3: str, service_addr3: str, city3: str,
    printed_name1: str, printed_name2: str,
    title1: str, dat1: str,
) -> bytes:
    buf = BytesIO()
    doc = _make_doc(buf)
    st = _styles()
    story = []

    _header(story, st, "METER ADD REQUEST")
    story.append(_kv_rows([
        ("Account Name",              account_name),
        ("Current ESIID",             esiid),
        ("Contract Name",             contract_name),
        ("Phone",                     phone),
        ("Current Contract End Date", current_contract_end_date),
        ("Current Rate",              rate),
        ("Request Type(s)",           ", ".join(request_types) if request_types else ""),
        ("Self-Select Move-In Date",  self_move_date),
        ("Self-Select Switch Date",   self_select_date),
        ("New Contract End Date",     contract_end_date),
        ("Add Meter Rate",            add_meter_rate),
        ("Billing Address",           billing_addr),
        ("Notes",                     note),
    ], st))

    _section(story, st, "Meters to Add")
    meter_data = [["ESIID", "Service Address", "City"]]
    for eid, svc, cty in [
        (esiid1, service_addr1, city1),
        (esiid2, service_addr2, city2),
        (esiid3, service_addr3, city3),
    ]:
        if eid:
            meter_data.append([eid, svc, cty])
    if len(meter_data) > 1:
        mtbl = Table(meter_data, colWidths=[2.0 * inch, 2.5 * inch, 2.0 * inch])
        mtbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0),  colors.HexColor("#003366")),
            ("TEXTCOLOR",     (0, 0), (-1, 0),  colors.white),
            ("FONTSIZE",      (0, 0), (-1, -1), 9),
            ("GRID",          (0, 0), (-1, -1), 0.5, colors.grey),
            ("TOPPADDING",    (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(mtbl)

    story.append(Spacer(1, 20))
    story.append(_kv_rows([
        ("Customer Signature",    "____________________________"),
        ("Printed Name",          printed_name1),
        ("Title",                 title1),
        ("Date",                  dat1),
        ("Representative Signature", "____________________________"),
        ("Printed Name",          printed_name2),
    ], st))

    doc.build(story)
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# Payment Plan
# ---------------------------------------------------------------------------

def generate_payment_plan_pdf(
    tdate: str, cus_name: str, out_bal: str,
    fins_date: str, finst_amount: str,
    sins_date: str, sinst_amount: str,
    tins_date: str, tinst_amount: str,
    foins_date: str, foinst_amount: str,
    bank_name: str, acc_name: str,
    routing_name: str, acc_no: str,
) -> bytes:
    buf = BytesIO()
    doc = _make_doc(buf)
    st = _styles()
    story = []

    _header(story, st, "PAYMENT PLAN AGREEMENT")
    story.append(_kv_rows([
        ("Date",              tdate),
        ("Customer Name",     cus_name),
        ("Outstanding Balance", out_bal),
    ], st))

    _section(story, st, "Installment Schedule")
    inst_data = [["Installment", "Date", "Amount"]]
    for label, dt, amt in [
        ("1st", fins_date, finst_amount),
        ("2nd", sins_date, sinst_amount),
        ("3rd", tins_date, tinst_amount),
        ("4th", foins_date, foinst_amount),
    ]:
        if dt or amt:
            inst_data.append([label, dt, f"${amt}" if amt else ""])
    if len(inst_data) > 1:
        itbl = Table(inst_data, colWidths=[1.0 * inch, 2.5 * inch, 2.5 * inch])
        itbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0),  colors.HexColor("#003366")),
            ("TEXTCOLOR",     (0, 0), (-1, 0),  colors.white),
            ("FONTSIZE",      (0, 0), (-1, -1), 9),
            ("GRID",          (0, 0), (-1, -1), 0.5, colors.grey),
            ("TOPPADDING",    (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(itbl)

    _section(story, st, "Bank Information")
    story.append(_kv_rows([
        ("Bank Name",      bank_name),
        ("Account Name",   acc_name),
        ("Routing Number", routing_name),
        ("Account Number", acc_no),
    ], st))

    story.append(Spacer(1, 20))
    story.append(_kv_rows([
        ("Customer Signature", "____________________________"),
        ("Date",               ""),
        ("Agent Signature",    "____________________________"),
        ("Date",               ""),
    ], st))

    doc.build(story)
    buf.seek(0)
    return buf.read()
