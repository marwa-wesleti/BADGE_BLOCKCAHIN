package com.esprit.badges.service;

import com.esprit.badges.blockchain.EthereumProperties;
import com.esprit.badges.model.IssuedDocument;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.WriterException;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.springframework.stereotype.Service;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Certificat de preuve en PDF : l'empreinte d'un document, la date du bloc, la transaction, le contrat, et un QR code
 * qui ouvre la verification publique. Le PDF ne contient jamais le document lui-meme (le serveur ne l'a jamais recu).
 *
 * Polices PDF standard (Helvetica, Courier) : elles ne gerent que l'alphabet latin. Un caractere qu'elles ne savent pas
 * ecrire (emoji, alphabet non latin...) est remplace par "?" plutot que de faire echouer la generation.
 */
@Service
public class CertificateService {

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss 'UTC'").withZone(ZoneOffset.UTC);
    private static final float MARGIN = 50;
    private static final float WIDTH = PDRectangle.A4.getWidth() - 2 * MARGIN;
    private static final Color BRAND = new Color(0x0f, 0x76, 0x6e);
    private static final Color MUTED = new Color(0x5b, 0x67, 0x78);
    private static final Color BOX = new Color(0xf1, 0xf5, 0xf9);

    private static final PDFont REGULAR = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
    private static final PDFont BOLD = new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);
    private static final PDFont MONO = new PDType1Font(Standard14Fonts.FontName.COURIER);

    private final EthereumProperties props;

    public CertificateService(EthereumProperties props) {
        this.props = props;
    }

    /** Lien de la page publique qui verifie ce document ; il est aussi encode dans le QR code. */
    public static String verificationLink(String baseUrl, String hash) {
        return baseUrl.replaceAll("/+$", "") + "/#/verifier?type=document&hash=" + hash;
    }

    public byte[] generate(IssuedDocument document, String baseUrl) {
        String link = verificationLink(baseUrl, document.getHash());
        try (PDDocument pdf = new PDDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            PDPage page = new PDPage(PDRectangle.A4);
            pdf.addPage(page);
            pdf.getDocumentInformation().setTitle("Certificat de preuve - " + safe(REGULAR, document.getTitle()));
            pdf.getDocumentInformation().setCreator("Badges blockchain");
            try (PDPageContentStream cs = new PDPageContentStream(pdf, page)) {
                draw(new Canvas(cs, page.getMediaBox().getHeight()), document, link);
            }
            pdf.save(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException("Generation du certificat impossible", e);
        }
    }

    private void draw(Canvas c, IssuedDocument d, String link) throws IOException {
        // ----- bandeau
        c.rect(0, 0, PDRectangle.A4.getWidth(), 96, BRAND);
        c.text(BOX, BOLD, 21, MARGIN, 52, "Certificat de preuve d'intégrité");
        c.text(Color.WHITE, REGULAR, 10, MARGIN, 72, "Une empreinte numérique gravée sur la blockchain Ethereum, vérifiable par tous");

        // ----- le document
        float y = 138;
        c.text(MUTED, BOLD, 8.5f, MARGIN, y, "DOCUMENT");
        y += 8;
        for (String line : wrap(BOLD, 17, d.getTitle(), WIDTH)) {
            y += 20;
            c.text(Color.BLACK, BOLD, 17, MARGIN, y, line);
        }
        y += 14;

        y = row(c, y, "Type", d.getType().label());
        String student = d.getStudent() == null
                ? "Aucun destinataire (archive de l'école)"
                : d.getStudent().getUsername() + " (" + d.getStudent().getEmail() + ")";
        y = row(c, y, "Remis à", student);
        y = row(c, y, "Gravé sur la blockchain le", formatDate(d.getBlockTime()));
        y = row(c, y, "Bloc n°", String.valueOf(d.getBlockNumber()));
        y = row(c, y, "Réseau", network());
        y = monoRow(c, y, "Contrat", d.getContractAddress());
        y = monoRow(c, y, "Transaction", d.getTxHash());

        // ----- l'empreinte, bien visible
        y += 24;
        c.text(MUTED, BOLD, 8.5f, MARGIN, y, "EMPREINTE SHA-256 DU DOCUMENT");
        y += 8;
        c.rect(MARGIN, y, WIDTH, 50, BOX);
        c.text(Color.BLACK, MONO, 11.5f, MARGIN + 12, y + 21, d.getHash().substring(0, 32));
        c.text(Color.BLACK, MONO, 11.5f, MARGIN + 12, y + 39, d.getHash().substring(32));
        y += 50 + 30;

        // ----- verification en ligne : QR code + lien
        float qrSize = 118;
        c.qr(link, MARGIN, y, qrSize);
        float textX = MARGIN + qrSize + 20;
        float textWidth = WIDTH - qrSize - 20;
        float ty = y + 14;
        c.text(Color.BLACK, BOLD, 12, textX, ty, "Vérifier en ligne");
        ty += 16;
        for (String line : wrap(REGULAR, 9.5f, "Scannez le QR code, ou ouvrez ce lien. La page interroge directement le smart contract : aucun compte n'est nécessaire.", textWidth)) {
            c.text(Color.BLACK, REGULAR, 9.5f, textX, ty, line);
            ty += 13;
        }
        ty += 4;
        for (String line : wrap(MONO, 7.5f, link, textWidth)) {
            c.text(BRAND, MONO, 7.5f, textX, ty, line);
            ty += 10;
        }
        y += qrSize + 28;

        // ----- verifier soi-meme
        c.text(Color.BLACK, BOLD, 12, MARGIN, y, "Vérifier soi-même, sans nous croire sur parole");
        String[] steps = {
                "1. Calculez l'empreinte SHA-256 du fichier que vous détenez. Sous Windows : Get-FileHash fichier.pdf -Algorithm SHA256",
                "2. Comparez-la à l'empreinte ci-dessus : elles doivent être identiques, caractère pour caractère.",
                "3. Lisez la même empreinte dans le contrat (page Etherscan du contrat) ou sur la page de vérification publique.",
        };
        y += 6;
        for (String step : steps) {
            for (String line : wrap(REGULAR, 9.5f, step, WIDTH)) {
                y += 13;
                c.text(Color.BLACK, REGULAR, 9.5f, MARGIN, y, line);
            }
            y += 2;
        }

        // ----- ce que la preuve dit, et ne dit pas
        y += 20;
        c.rect(MARGIN, y, WIDTH, 52, BOX);
        float by = y + 4;
        for (String line : wrap(REGULAR, 8.5f,
                "Ce certificat prouve que ce contenu exact existait à la date du bloc et n'a pas été modifié depuis : une seule lettre différente donne une autre empreinte. "
                        + "Il ne prouve ni qui a écrit le document, ni que son contenu est exact. Le document lui-même n'est pas conservé par le serveur : seule son empreinte l'est.",
                WIDTH - 24)) {
            by += 11.5f;
            c.text(MUTED, REGULAR, 8.5f, MARGIN + 12, by, line);
        }

        c.text(MUTED, REGULAR, 8, MARGIN, 812, "Certificat généré le " + DATE.format(Instant.now()) + " · Badges blockchain");
    }

    private float row(Canvas c, float y, String label, String value) throws IOException {
        y += 4;
        c.text(MUTED, REGULAR, 9, MARGIN, y + 13, label);
        float x = MARGIN + 150;
        boolean first = true;
        for (String line : wrap(REGULAR, 10.5f, value, WIDTH - 150)) {
            if (!first) {
                y += 13;
            }
            c.text(Color.BLACK, REGULAR, 10.5f, x, y + 13, line);
            first = false;
        }
        return y + 17;
    }

    private float monoRow(Canvas c, float y, String label, String value) throws IOException {
        y += 4;
        c.text(MUTED, REGULAR, 9, MARGIN, y + 13, label);
        float x = MARGIN + 150;
        boolean first = true;
        for (String line : wrap(MONO, 8.5f, value, WIDTH - 150)) {
            if (!first) {
                y += 11;
            }
            c.text(Color.BLACK, MONO, 8.5f, x, y + 13, line);
            first = false;
        }
        return y + 17;
    }

    private String network() {
        long chain = props.chainId();
        return chain == 11155111L ? "Ethereum Sepolia (réseau de test)" : "Chaîne n° " + chain;
    }

    private static String formatDate(String isoTime) {
        try {
            return DATE.format(Instant.parse(isoTime));
        } catch (RuntimeException e) {
            return isoTime;
        }
    }

    /** Coupe un texte en lignes qui tiennent dans la largeur ; un mot trop long (empreinte, lien) est coupe au caractere. */
    static List<String> wrap(PDFont font, float size, String text, float maxWidth) throws IOException {
        List<String> lines = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (String word : safe(font, text).split("\\s+")) {
            if (word.isEmpty()) {
                continue;
            }
            String candidate = current.length() == 0 ? word : current + " " + word;
            if (width(font, size, candidate) <= maxWidth) {
                current = new StringBuilder(candidate);
                continue;
            }
            if (current.length() > 0) {
                lines.add(current.toString());
                current = new StringBuilder();
            }
            String rest = word;
            while (width(font, size, rest) > maxWidth) {
                int cut = rest.length() - 1;
                while (cut > 1 && width(font, size, rest.substring(0, cut)) > maxWidth) {
                    cut--;
                }
                lines.add(rest.substring(0, cut));
                rest = rest.substring(cut);
            }
            current = new StringBuilder(rest);
        }
        if (current.length() > 0 || lines.isEmpty()) {
            lines.add(current.toString());
        }
        return lines;
    }

    private static float width(PDFont font, float size, String text) throws IOException {
        return font.getStringWidth(text) / 1000f * size;
    }

    /** Remplace par "?" les caracteres que la police ne sait pas ecrire (et les retours a la ligne par des espaces). */
    static String safe(PDFont font, String text) {
        StringBuilder out = new StringBuilder();
        text.codePoints().forEach(cp -> {
            if (Character.isWhitespace(cp) || Character.isISOControl(cp)) {
                out.append(' ');
                return;
            }
            String s = new String(Character.toChars(cp));
            try {
                font.encode(s);
                out.append(s);
            } catch (IOException | IllegalArgumentException e) {
                out.append('?');
            }
        });
        return out.toString();
    }

    /**
     * Petit pinceau : on raisonne en distance depuis le HAUT de la page (comme sur un ecran), le PDF compte depuis le bas.
     */
    private static final class Canvas {
        private final PDPageContentStream cs;
        private final float pageHeight;

        Canvas(PDPageContentStream cs, float pageHeight) {
            this.cs = cs;
            this.pageHeight = pageHeight;
        }

        void rect(float x, float top, float w, float h, Color color) throws IOException {
            cs.setNonStrokingColor(color);
            cs.addRect(x, pageHeight - top - h, w, h);
            cs.fill();
        }

        /** baseline = distance du haut de la page jusqu'a la ligne sur laquelle repose le texte. */
        void text(Color color, PDFont font, float size, float x, float baseline, String text) throws IOException {
            cs.setNonStrokingColor(color);
            cs.beginText();
            cs.setFont(font, size);
            cs.newLineAtOffset(x, pageHeight - baseline);
            cs.showText(safe(font, text));
            cs.endText();
        }

        void qr(String content, float x, float top, float size) throws IOException {
            BitMatrix matrix;
            try {
                matrix = new QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, 1, 1,
                        Map.of(EncodeHintType.MARGIN, 1, EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M));
            } catch (WriterException e) {
                throw new IOException("QR code impossible", e);
            }
            float module = size / matrix.getWidth();
            cs.setNonStrokingColor(Color.BLACK);
            for (int row = 0; row < matrix.getHeight(); row++) {
                for (int col = 0; col < matrix.getWidth(); col++) {
                    if (matrix.get(col, row)) {
                        cs.addRect(x + col * module, pageHeight - top - (row + 1) * module, module + 0.2f, module + 0.2f);
                    }
                }
            }
            cs.fill();
        }
    }
}
