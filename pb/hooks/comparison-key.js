module.exports = (text) => text.normalize("NFC").toUpperCase().normalize("NFC");
