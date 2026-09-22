"""
Renewal and B&E start-date resolution rules.

docs/ENROLLMENT_RULES.md Build Plan #6 and #7 (decided 2026-09-21). Shared
by the three places that guard a Renewal's or B&E's start date against the
customer's current contract:
  - routers/contracts_confirm.py  /send-email
  - routers/enrollment_engine.py  /generate-masterroll
  - routers/enrollment_engine.py  /create-internal-batch
kept in one place so the three call sites can't drift from each other.

The two rules are deliberately different functions -- per the user
(2026-09-21): Renewal strictly starts at the end of the current contract
(and can be done off of an account_type='default' fallback contract, since
that's just the evergreen rate with no real term to respect). B&E starts
now (ASAP or whatever date is on the new contract) and blends the
remaining term into the new one -- it requires a real, non-default active
contract to blend against and is never anchored to that contract's end
date. Do not merge these two functions or reuse one for the other type.
"""
from datetime import date
from typing import Optional, Tuple

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def fetch_active_contract(
    db: AsyncSession, esi_id: str
) -> Tuple[Optional[date], Optional[str]]:
    """
    Returns (contract_end_date, account_type) for the ESI's active contract,
    preferring a real (non-default) one over the auto-generated
    account_type='default' fallback.

    Both a real contract and its default fallback are commonly 'active' at
    the same time -- enrollment_engine.py's /activate creates the default
    row eagerly at activation (not only once the real contract actually
    expires; the cron that would flip an expired real contract's status is
    still a TODO there), and the default row's contract_end_date is an
    artificial ~30-years-out placeholder. Picking "latest end date" without
    this preference would always select the default row over the real one.

    Returns (None, None) if there's no active row at all for the ESI.
    """
    result = await db.execute(
        text(
            "SELECT contract_end_date, account_type FROM contract_renewal"
            " WHERE premise_id = :esi AND status = 'active'"
            " ORDER BY (account_type = 'default') ASC, contract_end_date DESC"
            " LIMIT 1"
        ),
        {"esi": esi_id},
    )
    row = result.fetchone()
    if not row:
        return None, None
    return row[0], row[1]


def resolve_renewal_start_date(
    today: date,
    contract_end_date: Optional[date],
    submitted_start: Optional[date],
) -> Tuple[Optional[date], Optional[str]]:
    """
    Anchored on today vs. the current contract's end date (NOT the
    submitted start date -- a contract is executed/binding, so a
    discrepancy of more than a month means something is wrong with the
    system or the contract and needs a human, not a silent override):

      1. today <= contract_end_date             -> force start = contract_end_date
      2. contract_end_date < today <= +30 days  -> force start = today (ASAP)
      3. today > contract_end_date + 30 days    -> block, human intervention

    Returns (resolved_start_date, block_reason). Exactly one is set,
    except when contract_end_date is unknown (no active contract found
    for the ESI), in which case the submitted date passes through
    unchanged and neither guard applies.
    """
    if contract_end_date is None:
        return submitted_start, None

    days_past = (today - contract_end_date).days
    if days_past <= 0:
        return contract_end_date, None
    if days_past <= 30:
        return today, None
    return None, (
        f"submitted {days_past} days after the current contract's end date"
        f" ({contract_end_date}) -- more than 30 days is treated as a"
        " contract/data discrepancy requiring human intervention. Correct"
        " the start date, or verify the contract end date on file, before"
        " proceeding."
    )


def resolve_be_start_date(
    submitted_start: Optional[date],
    contract_end_date: Optional[date],
    account_type: Optional[str],
) -> Tuple[Optional[date], Optional[str]]:
    """
    B&E (Blend and Extend) starts now -- the submitted date (ASAP or a
    specific future date, whatever is on the new contract) passes through
    unchanged. It is NOT forced to align with the current contract's end
    date the way Renewal is: a customer with a contract ending months from
    now can still blend a new 24-month contract starting today.

    The one thing B&E requires is a real, non-default active contract to
    blend into -- unlike Renewal, it can't be done off the auto-generated
    account_type='default' fallback contract (that's just the evergreen
    rate; there's no real term left to blend).

    Returns (resolved_start_date, block_reason). Exactly one is set.
    """
    if contract_end_date is None:
        return None, (
            "no active contract found for this ESI -- B&E requires an"
            " existing contract to blend and extend. If there is none on"
            " file, this should be a New enrollment instead."
        )
    if account_type == "default":
        return None, (
            "the active contract on file is the default/evergreen fallback"
            " rate, not a real term contract -- B&E can't blend against a"
            " default contract. Use Renewal instead."
        )
    return submitted_start, None
