const express = require("express");
const router = express.Router();
const {WebhookClient, Card} = require("dialogflow-fulfillment");
const DialogflowResponse = require("../models/DialogflowResponse");
const MiiaAPI = require("../api/MiiaAPI");
const miiaAPI = new MiiaAPI(
    process.env.BASEURL,
    process.env.USERNAME,
    process.env.PASSWORD,
    process.env.DOCTYPE
);

/**
 * Routes HTTP POST requests to index
 */
router.post("/", function (req, res) {
    if (!req.hasOwnProperty("body") || Object.keys(req.body).length === 0) {
        res.status(400).send("Empty body");
    }

    const agent = new WebhookClient({request: req, response: res});

    miiaAPI.query(req.body.queryResult.queryText, (error, response, body) => {
        let intentMap = new Map();
        if (!error && response.statusCode === 200) {
            intentMap.set("Default Fallback Intent", (agent) => getResponse(agent, res, body));
        } else {
            intentMap.set("Default Fallback Intent", error);
        }
        agent.handleRequest(intentMap);

    });
});

function getResponse(agent, response, body) {
    let parsedBody = JSON.parse(body);

    let fulfillmentText = "Geen antwoord gevonden";

    // Get documents with highest scores
    if (parsedBody.hasOwnProperty("documents") && parsedBody.documents !== null) {

        // Take the first respond (highest score)
        if (parsedBody.documents.length > 0) {
            let doc = parsedBody.documents[0];
            if (doc.hasOwnProperty("docUri") && doc.hasOwnProperty("displaySummary") && doc.displaySummary !== "") {
                fulfillmentText = `${doc.displaySummary}\nBekijk het verslag: ${doc.docUri}`;
            }
        }
        agent.add(fulfillmentText);

        let i = 0; // Cursor
        let j = 0; // Card count (max 10 cards)
        while (i < parsedBody.documents.length && j < 9) {
            let document = parsedBody.documents[i];

            // Construct a card, if this is a reasonable answer
            if (document.hasOwnProperty("score")
                && document.hasOwnProperty("originalURI")
                && document.score > 5) {

                // Construct default card
                let card = new Card(getDescription(document) !== null ? getDescription(document) : "Geen beschrijving");
                if (document.hasOwnProperty("publicationDate")) {
                    let date = new Date(document.publicationDate);
                    card.setText(`${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`);
                }
                if (document.hasOwnProperty("docUri")) {
                    card.setButton({
                        text: 'Bekijk het verslag',
                        url: document.docUri
                    });
                }

                // Attempt to make a better card on the basis of the associated paragraph with the highest score
                if (parsedBody.hasOwnProperty("paragraphs")) {
                    let paragraphs = [];  // Associated paragraphs
                    parsedBody.paragraphs.forEach(function (item) {
                        if (item.hasOwnProperty("originalURI") && item.originalURI === document.originalURI) {
                            paragraphs.push(item);
                        }
                    });
                    paragraphs.sort(function (a, b) {  // Sort on score, highest to lowest
                        return b.score - a.score;
                    });

                    if (paragraphs.length > 0) {
                        let paragraph = paragraphs[0];  // Highest scoring paragraph

                        // Make card
                        if (paragraph.hasOwnProperty("publicationDate")
                            && paragraph.hasOwnProperty("docUri")) {
                            let date = new Date(paragraph.publicationDate);
                            if (getDescription(paragraph) !== null) {
                                card = new Card(getDescription(paragraph));
                            }
                            card.setText(`${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`)
                                .setButton({
                                    text: 'Bekijk het verslag',
                                    url: paragraph.docUri
                                });
                        }
                    }
                }
                agent.add(card);
                j++;
            }
            i++;
        }
    }
}

function error(agent) {
    agent.add(`Geen antwoord gevonden`);
}

function getDescription(item) {
    let description = null;
    if (item.hasOwnProperty("summary") && item.summary !== null) {
        description = item.summary;
    } else if (item.hasOwnProperty("displaySummary") && item.displaySummary !== null) {
        description = item.displaySummary;
    }
    return description;
}

module.exports = router;
