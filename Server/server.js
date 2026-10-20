
const express = require("express");
const path = require("path")
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));


console.log(__dirname);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);

});

module.exports = app;