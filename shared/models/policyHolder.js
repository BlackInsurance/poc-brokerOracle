"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var mongoose_1 = require("mongoose");
// Define a DB Schema.
exports.policyHolderSchema = new mongoose_1.Schema({
    policyHolderID: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: false,
        default: ''
    },
    password: {
        type: String,
        required: false,
        default: ''
    },
    balanceBLCK: {
        type: Number,
        required: true,
        default: 0
    },
    confirmationID: {
        type: String,
        required: false,
        default: ''
    },
    facebook: {
        id: {
            type: String,
            required: false,
            default: ''
        },
        token: {
            type: String,
            required: false,
            default: ''
        },
        name: {
            type: String,
            required: false,
            default: ''
        }
    },
    google: {
        id: {
            type: String,
            required: false,
            default: ''
        },
        token: {
            type: String,
            required: false,
            default: ''
        },
        name: {
            type: String,
            required: false,
            default: ''
        },
        email: {
            type: String,
            required: false,
            default: ''
        }
    }
});
