"""Discovery Bank card statements: owed balances, masked card numbers, card repayments and
payment-gateway purchases."""

from datetime import date
from decimal import Decimal

from categorisation.classifier import classify_transaction
from pdf_processor.statement_balance import _closing_from_text
from pdf_processor.statement_schema import resolve_extracted_statement


def test_a_masked_card_number_is_not_read_as_the_closing_balance():
    text = "Card ***1234 Online\nClosing balance on\n4 April 2026\n- R8 997.05\n"
    closing = _closing_from_text(text)
    assert closing is not None
    assert closing.amount == Decimal("-8997.05") or closing.amount == Decimal("8997.05")
    assert closing.amount != Decimal("1234")


def test_a_printed_credit_limit_marks_the_statement_as_a_credit_card():
    text = "Statement for card\nCredit limit R117 000.00\nClosing balance on 4 April 2026 - R8 997.05\n"
    statement = resolve_extracted_statement(text, [], account_type=None)
    assert statement.account_type == "credit_card"


def test_a_card_payment_of_the_overdue_amount_is_an_internal_transfer():
    result = classify_transaction("Payment of overdue amount", "credit")
    assert result.transaction_class == "internal_transfer"


def test_inter_account_transfers_are_internal_transfers():
    result = classify_transaction("Inter account transfer from account...0000 Repay", "credit")
    assert result.transaction_class == "internal_transfer"
    assert result.category_name == "Transfers"


