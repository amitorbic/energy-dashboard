# Enrollment Engine — Business Rules

## Overview
This document captures the business rules for ORBIC's 
enrollment engine. These rules govern how different 
contract types are processed, validated, and submitted 
to ERCOT.

---

## Contract Types and ERCOT Routing

### New Enrollment
- Brand new customer to ORBIC
- ESI ID not previously active with ORBIC
- Goes to ERCOT (814 transaction required)
- Guard: blocked if ESI ID has status active/pending/going_final

### Renewal
- Same customer, extending term
- ESI ID already active with ORBIC
- Does NOT go to ERCOT
- Validation: start date of new contract must align 
  with current contract end date (within 30 days, 
  same month, or 2-3 days difference)
- If dates don't align: contract must be corrected 
  before proceeding
- Creates new contract_renewal row (never updates existing)

### Assignment
- Change of ownership/customer at the meter location
- Broker may or may not change as part of assignment
- There is no "broker change only" contract type
- If MVI/Switch involved: goes to ERCOT (814 required, 
  ERCOT needs to know customer name changed)
- If plain assignment (no MVI/Switch): internal process, 
  confirmation sent, then switch/MVI submitted to ERCOT
- Rate: usually same rate continued
- If rate changes on assignment: treated as completely 
  new customer, old customer gets ETF
- Commission/Mills: go to broker on record for current 
  contract. If broker changes on assignment, new broker 
  comes into picture only after current contract ends
- Creates new contract_renewal row

### B&E (Blend and Extend)
- Same customer blending current rate into new longer term
- Does NOT go to ERCOT
- Applied as new renewal row with given rate, term, 
  commission, mills
- Creates new contract_renewal row

### Addition
- New ESI ID (new location) added to existing customer account
- ESI ID is brand new — may or may not be active with ORBIC
- If not active with ORBIC: goes to ERCOT (814 required)
- If already active with ORBIC: flagged/blocked, 
  must be handled separately
- Creates new contract_renewal row

### Multi-Start
- One contract covering multiple ESI IDs with different 
  start dates
- Some ESI IDs: ASAP start
- Some ESI IDs: future start date
- Handling:
  * ASAP start → current enrollment batch, process now
  * Future start > 30 days → held in future table, 
    processed later
  * Future start < 30 days → submit based on current 
    start date
  * Meter read start → picks next TDSP meter read date 
    from TDSP meter read calendar

---

## Start Date Types

### ASAP
- Process immediately in current batch
- Switch placed as soon as ERCOT allows (3 business days minimum)

### Specific Date
- Customer or broker has requested a specific switch date
- Must be at least 3 business days from submission

### Meter Read Date
- Picks the next available meter read date from TDSP calendar
- Must coordinate with TDSP for the ESI ID's meter read cycle

### Future Date (> 30 days)
- Held in a future table
- Not included in current MassRoll batch
- Processed when date falls within 30-day window

### Future Date (< 30 days)
- Submitted based on current start date
- Included in current MassRoll batch

### Priority Move-In
- Done by end of day
- Extra charge applies
- Uses Priority Codes in MassRoll

---

## Active Contract Guard Rules

### Hard Block (cannot proceed):
- type_of_contract = New → ESI active/pending/going_final → BLOCK
- type_of_contract = Addition → ESI active/pending/going_final → BLOCK

### Validate and Warn (can proceed with correction):
- type_of_contract = Renewal → ESI active → validate dates
  * Start date within 30 days of current end date → WARN, allow
  * Start date not aligned → BLOCK, request correction
- type_of_contract = B&E → same as Renewal date validation

### Allow (internal process):
- type_of_contract = Assignment → ESI active → ALLOW
  * Determine if MVI/Switch needed based on ownership change
  * Goes through internal batch, not MassRoll

---

## going_final Status
- ESI ID has a switch placed in ERCOT for a future date
- Cannot submit another enrollment until current 
  going_final resolves
- Treated same as active for guard purposes

---

## Key Rules
- Every contract type ALWAYS creates a new row in 
  contract_renewal — never updates existing rows
- contract_renewal is the single source of truth 
  for all enrollment statuses
- Broker on record receives commission for current 
  active contract regardless of any changes
- Rate and date alignment are critical — 
  renewal date must match current contract end date
- Multi-start contracts split by start date type 
  at enrollment engine level

---

## Pending / Not Yet Built
- Future table for future start dates (> 30 days)
- TDSP meter read calendar integration
- ETF calculation for rate-change assignments
- Priority Move-In priority code handling
- going_final status auto-detection from ERCOT
- Date alignment validation in contracts_confirm.py 
  for Renewal and B&E types
- Assignment MVI/Switch determination logic

---

## Open Questions
- Early renewal: does ORBIC allow renewal more than 
  30 days before current contract ends?
- Rate correction: same ESI ID, same dates, wrong rate 
  entered — what contract type is this?
- Move-out/Move-in same meter: new customer at same 
  location — New or Assignment?
