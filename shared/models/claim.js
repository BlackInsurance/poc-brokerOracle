"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var mongoose_1 = require("mongoose");
exports.claimSchema = new mongoose_1.Schema({
    claimID: {
        type: String,
        required: true
    },
    claimDateISOString: {
        type: String,
        required: true,
        default: (new Date()).toISOString()
    },
    highTempLast24Hours: {
        type: Number,
        required: true
    },
    rainLast24Hours: {
        type: Number,
        required: true
    },
    cloudsLast24Hours: {
        type: Number,
        required: true
    },
    highWaveLast24Hours: {
        type: Number,
        required: true
    },
    settlement: {
        paymentID: {
            type: String,
            required: true
        },
        from: {
            type: String,
            required: true
        },
        to: {
            type: String,
            required: true
        },
        amount: {
            type: Number,
            required: true
        },
        dateISOString: {
            type: String,
            required: true,
            default: (new Date()).toISOString()
        },
        approved: {
            type: Boolean,
            required: false,
            default: false
        }
    }
});
