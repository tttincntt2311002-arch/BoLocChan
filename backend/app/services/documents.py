"""Authenticated exports with a privacy-preserving, public verification QR."""

import base64
import io
import unicodedata
from datetime import timedelta, timezone
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlencode
from xml.sax.saxutils import escape

import qrcode
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Paragraph

from app.core.config import get_settings
from app.core.errors import fail
from app.models.models import CertificateStatus


def verification_url(certificate):
    return (
        get_settings().PUBLIC_FRONTEND_URL
        + "/verify?"
        + urlencode(
            {
                "chainId": certificate.chain_id,
                "contractAddress": certificate.contract_address,
                "tokenId": certificate.token_id,
            }
        )
    )


def document_data(certificate):
    if certificate.status not in (CertificateStatus.ISSUED, CertificateStatus.REVOKED) or certificate.token_id is None:
        fail(409, "certificate_not_issued", "Only blockchain-confirmed certificates have documents or QR codes")
    return {
        "id": certificate.id,
        "recipient_name": certificate.recipient_name or certificate.recipient.full_name,
        "event_name": certificate.event.name,
        "event_start_date": certificate.event.start_date,
        "event_end_date": certificate.event.end_date,
        "organization_name": certificate.event.organization.name,
        "organization_logo": certificate.event.organization.logo_data_url,
        "chain_id": certificate.chain_id,
        "contract_address": certificate.contract_address,
        "token_id": certificate.token_id,
        "issued_at": certificate.issued_at,
        "tx_hash": certificate.tx_hash,
        "status": certificate.status,
        "verification_url": verification_url(certificate),
    }


def qr_png(url):
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=8, border=4)
    qr.add_data(url)
    qr.make(fit=True)
    buffer = io.BytesIO()
    qr.make_image(fill_color="#172B4D", back_color="white").save(buffer, format="PNG")
    return buffer.getvalue()


@lru_cache
def register_fonts():
    directory = Path(__file__).resolve().parents[1] / "assets" / "fonts"
    pdfmetrics.registerFont(TTFont("CertificateSans", str(directory / "NotoSans-Regular.ttf")))
    pdfmetrics.registerFont(TTFont("CertificateSansBold", str(directory / "NotoSans-Bold.ttf")))


def certificate_pdf(data):
    register_fonts()
    output = io.BytesIO()
    width, height = landscape(A4)
    canvas = Canvas(output, pagesize=(width, height))
    canvas.setTitle("SBT Certificate " + data["token_id"])
    canvas.setAuthor(data["organization_name"])
    navy, gold = colors.HexColor("#172B4D"), colors.HexColor("#B38B42")
    canvas.setFillColor(colors.HexColor("#FCFAF6"))
    canvas.rect(0, 0, width, height, fill=1, stroke=0)
    canvas.setFillColor(navy)
    canvas.rect(0, 0, 23, height, fill=1, stroke=0)
    canvas.setFillColor(gold)
    canvas.rect(23, 0, 4, height, fill=1, stroke=0)
    canvas.setStrokeColor(gold)
    canvas.setLineWidth(1)
    canvas.roundRect(45, 35, width - 80, height - 70, 8, fill=0, stroke=1)

    def text(value, x, y, size=11, bold=False, center=False, max_width=None, color=navy):
        value = unicodedata.normalize("NFC", str(value))
        font = "CertificateSansBold" if bold else "CertificateSans"
        if max_width:
            while pdfmetrics.stringWidth(value, font, size) > max_width and size > 5:
                size -= 0.5
        canvas.setFillColor(color)
        canvas.setFont(font, size)
        (canvas.drawCentredString if center else canvas.drawString)(x, y, value)

    if data["organization_logo"]:
        image = base64.b64decode(data["organization_logo"].split(",", 1)[1])
        canvas.drawImage(
            ImageReader(io.BytesIO(image)),
            72,
            482,
            width=50,
            height=50,
            preserveAspectRatio=True,
            anchor="c",
            mask="auto",
        )
    else:
        canvas.setFillColor(navy)
        canvas.circle(97, 507, 25, fill=1, stroke=0)
        initials = "".join(word[0] for word in data["organization_name"].split()[:2])
        text(initials, 97, 500, 17, bold=True, center=True, color=colors.white)
    text(data["organization_name"], 140, 511, 18, bold=True, max_width=590)
    text("SOULBOUND CREDENTIAL  /  ETHEREUM", 140, 490, 8, color=gold)
    center = width / 2 + 12
    text("CHỨNG NHẬN THAM GIA", center, 423, 28, bold=True, center=True)
    text("CERTIFICATE OF PARTICIPATION", center, 402, 9, center=True, color=gold)
    text("Trân trọng chứng nhận", center, 365, 12, center=True)
    text(data["recipient_name"], center, 329, 29, bold=True, center=True, max_width=650)
    text("đã tham gia sự kiện", center, 299, 11, center=True)
    style = ParagraphStyle(
        "event", fontName="CertificateSansBold", fontSize=16, leading=21, alignment=1, textColor=navy
    )
    paragraph = Paragraph(escape(unicodedata.normalize("NFC", data["event_name"])), style)
    event_width, event_height = paragraph.wrap(650, 70)
    if event_height > 63:
        style.fontSize, style.leading = 12, 16
        paragraph = Paragraph(escape(data["event_name"]), style)
        event_width, event_height = paragraph.wrap(650, 70)
    paragraph.drawOn(canvas, center - event_width / 2, 278 - event_height)

    def date(value):
        return value.astimezone(timezone(timedelta(hours=7))).strftime("%d/%m/%Y")

    text(f"Ngày tổ chức: {date(data['event_start_date'])} – {date(data['event_end_date'])}", 78, 206, 10)
    text(f"Ngày cấp: {date(data['issued_at'])}", 78, 185, 10)
    text("TOKEN ID  " + data["token_id"], 78, 156, 11, bold=True, max_width=545)
    text("CHAIN ID  " + str(data["chain_id"]), 78, 135, 9)
    qr = qr_png(data["verification_url"])
    canvas.drawImage(ImageReader(io.BytesIO(qr)), width - 182, 132, width=110, height=110)
    canvas.linkURL(data["verification_url"], (width - 182, 132, width - 72, 242), relative=0)
    text("Quét QR để xác thực", width - 127, 120, 8, center=True)
    canvas.setStrokeColor(gold)
    canvas.line(78, 109, width - 70, 109)
    text("Contract: " + data["contract_address"], 78, 92, 8)
    text("Transaction: " + data["tx_hash"], 78, 76, 8, max_width=width - 150)
    text("Ngày theo UTC+07:00. Chứng nhận không thể chuyển nhượng. Quét QR để kiểm tra hiệu lực hiện tại.", 78, 50, 7)
    canvas.showPage()
    canvas.save()
    return output.getvalue()
