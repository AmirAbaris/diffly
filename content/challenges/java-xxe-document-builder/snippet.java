package com.acme.ingest.xml;

import java.io.IOException;
import java.io.StringReader;
import java.util.Optional;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import org.w3c.dom.Document;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;

public class InvoiceXmlParser {
    private static final int MAX_XML_BYTES = 262_144;

    public record ParsedInvoice(String invoiceNumber, String vendorCode, String totalAmount) {}

    public Optional<ParsedInvoice> parsePartnerInvoice(String rawXmlPayload)
            throws ParserConfigurationException, SAXException, IOException {
        if (rawXmlPayload == null || rawXmlPayload.isBlank()) {
            return Optional.empty();
        }
        if (rawXmlPayload.length() > MAX_XML_BYTES) {
            throw new IllegalArgumentException("XML payload exceeds maximum allowed size");
        }

        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setNamespaceAware(true);

        DocumentBuilder builder = factory.newDocumentBuilder();
        Document doc = builder.parse(new InputSource(new StringReader(rawXmlPayload)));
        doc.getDocumentElement().normalize();

        String invoiceNumber = extractTagText(doc, "invoiceNumber");
        String vendorCode = extractTagText(doc, "vendorCode");
        String totalAmount = extractTagText(doc, "totalAmount");

        if (invoiceNumber == null || vendorCode == null || totalAmount == null) {
            return Optional.empty();
        }
        return Optional.of(new ParsedInvoice(invoiceNumber, vendorCode, totalAmount));
    }

    private String extractTagText(Document doc, String tagName) {
        NodeList nodes = doc.getElementsByTagName(tagName);
        if (nodes.getLength() == 0 || nodes.item(0) == null) {
            return null;
        }
        return nodes.item(0).getTextContent().trim();
    }
}
