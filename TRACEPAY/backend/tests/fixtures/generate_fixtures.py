from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle
from reportlab.pdfgen import canvas


ROOT = Path(__file__).parent


def table_pdf(name: str, pages: list[list[list[str]]]) -> None:
    path = ROOT / name
    document = SimpleDocTemplate(str(path), pagesize=A4, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
    story = []
    for page_index, rows in enumerate(pages):
        table = Table(rows, repeatRows=1, colWidths=[75, 210, 75, 75, 85])
        table.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
            ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ]))
        story.append(table)
        if page_index < len(pages) - 1:
            from reportlab.platypus import PageBreak
            story.append(PageBreak())
    document.build(story)


def text_pdf(name: str, lines: list[str]) -> None:
    path = ROOT / name
    pdf = canvas.Canvas(str(path), pagesize=A4)
    y = 800
    for line in lines:
        pdf.drawString(45, y, line)
        y -= 20
    pdf.save()


def scanned_pdf(name: str) -> None:
    image = Image.new("RGB", (1654, 2339), "white")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=32)
    lines = [
        "TRACEPAY SYNTHETIC SCANNED STATEMENT",
        "Date        Description             Amount",
        "18/09/2026  SCANNED PAYMENT        -450.00",
        "19/09/2026  SCANNED DEPOSIT          +900.00",
    ]
    y = 180
    for line in lines:
        draw.text((120, y), line, fill="black", font=font)
        y += 100
    image_path = ROOT / "scanned_fixture.png"
    image.save(image_path)
    pdf = canvas.Canvas(str(ROOT / name), pagesize=A4)
    pdf.drawImage(ImageReader(image_path), 0, 0, width=A4[0], height=A4[1])
    pdf.save()
    image_path.unlink()


if __name__ == "__main__":
    header = [["Date", "Description", "Debit", "Credit", "Balance"]]
    table_pdf("standard_table.pdf", [header + [
        ["18/09/2026", "WOOLWORTHS", "450.00", "0.00", "12550.00"],
        ["19/09/2026", "SALARY", "0.00", "900.00", "13450.00"],
    ]])
    table_pdf("ambiguous_amount_balance.pdf", [[
        ["Date", "Description", "Amount", "Balance"],
        ["18/09/2026", "AMBIGUOUS ROW", "450.00", "12500.00"],
    ]])
    repeated = header + [["18/09/2026", "FIRST PAYMENT", "100.00", "0.00", "9900.00"]]
    second = header + [["19/09/2026", "SECOND PAYMENT", "50.00", "0.00", "9850.00"]]
    table_pdf("multi_page_statement.pdf", [repeated, second])
    duplicate = header + [
        ["18/09/2026", "DUPLICATE PAYMENT", "100.00", "0.00", "9900.00"],
        ["18/09/2026", "DUPLICATE PAYMENT", "100.00", "0.00", "9900.00"],
    ]
    table_pdf("duplicate_rows.pdf", [duplicate])
    mismatch = header + [
        ["18/09/2026", "MISMATCH PAYMENT", "100.00", "0.00", "9900.00"],
        ["19/09/2026", "MISMATCH DEPOSIT", "0.00", "50.00", "10000.00"],
    ]
    table_pdf("balance_mismatch.pdf", [mismatch])
    text_pdf("text_fallback.pdf", [
        "Date Description Amount",
        "18/09/2026 TEXT PAYMENT -450.00",
        "19/09/2026 TEXT DEPOSIT +900.00",
    ])
    scanned_pdf("scanned_style.pdf")
