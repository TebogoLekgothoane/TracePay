"""When a stored description is replaced by the narration on the page."""

from pdf_processor.description_recovery import narration_to_use


def test_a_placeholder_takes_a_readable_narration() -> None:
    assert narration_to_use("No description printed", "#Service Fees #Payments Bundle Fee") == (
        "#Service Fees #Payments Bundle Fee"
    )


def test_a_digits_only_reference_takes_the_narration_that_contains_it() -> None:
    assert narration_to_use("261001", "Magtape Debit Edgequig 261001") == "Magtape Debit Edgequig 261001"


def test_a_description_that_already_names_the_payment_is_left_alone() -> None:
    assert narration_to_use("POS Purchase KFC", "POS Purchase KFC 05 Jul") is None


def test_a_fee_line_drops_the_date_and_the_purchase_it_was_read_beside() -> None:
    assert narration_to_use("No description printed", "l06 #Service Fees #int Pymt Fee-34.99 Googl") == (
        "#Service Fees #int Pymt Fee"
    )


def test_a_line_that_only_says_fees_is_kept() -> None:
    assert narration_to_use("No description printed", "Fees") == "Fees"


def test_a_narration_with_no_words_is_not_used() -> None:
    assert narration_to_use("No description printed", "12 3.00") is None
