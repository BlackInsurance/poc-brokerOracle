"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var mongoose_1 = require("mongoose");
var claim_1 = require("./claim");
var policyHolder_1 = require("./policyHolder");
exports.policySchema = new mongoose_1.Schema({
    policyID: String,
    product: {
        productID: {
            type: String,
            required: true,
            default: 'RAINY_DAY_INSURANCE'
        },
        creator: {
            type: String,
            required: true,
            default: 'BLACK_INSURANCE_MANAGER'
        },
        name: {
            type: String,
            required: true,
            default: 'Rainy Day Insurance'
        },
        description: {
            type: String,
            required: true,
            default: 'Insurance that will pay you 1 BLCK token each day that the city covered by an active Policy receives 10mm or more of rain within a 24 hour period.  Max coverage of 100 BLCK for any single Policy.'
        },
        productDetailURL: {
            type: String,
            required: true,
            default: 'https://wwww.black.insure/'
        }
    },
    issuingBroker: {
        participantID: {
            type: String,
            required: true,
            default: 'BROKER'
        },
        type: {
            type: String,
            required: true,
            default: 'Broker'
        },
        email: {
            type: String,
            required: true,
            default: 'poc@black.insure'
        },
        balanceBLCK: {
            type: Number,
            required: true,
            default: 0
        }
    },
    policyHolder: {
        policyHolderID: {
            type: String,
            required: true
        }
    },
    status: {
        type: String,
        required: true,
        default: "Pending"
    },
    createDateISOString: {
        type: String,
        required: true,
        default: (new Date()).toISOString()
    },
    startDateISOString: {
        type: String,
        required: true,
        default: (new Date()).toISOString()
    },
    endDateISOString: {
        type: String,
        required: true,
        default: new Date(Date.parse('11-01-2018')).toISOString()
    },
    lastClaimDateISOString: {
        type: String,
        required: false
    },
    coveredCity: {
        name: {
            type: String,
            required: true
        },
        latitude: {
            type: Number,
            required: true
        },
        longitude: {
            type: Number,
            required: true
        }
    },
    ethereumAddress: {
        type: String,
        required: false,
        default: ''
    },
    claims: {
        type: [claim_1.claimSchema],
        required: false,
        default: undefined
    }
});
exports.getPolicyFromDB = function (db, policyID) {
    var ClaimModel = db.model("Claim", claim_1.claimSchema);
    var PolicyModel = db.model("Policy", exports.policySchema);
    return PolicyModel.findOne({ 'policyID': policyID })
        .then(function (policy) {
        return Promise.resolve(policy);
    })
        .catch(function (err) {
        console.log('Failed while attempting to retrieve a specific Policy from the DB');
        console.log(err);
        return Promise.reject(err);
    });
};
exports.getPolicyByConfirmationFromDB = function (db, confirmationID) {
    var ClaimModel = db.model("Claim", claim_1.claimSchema);
    var PolicyModel = db.model("Policy", exports.policySchema);
    var PolicyHolderModel = db.model("PolicyHolder", policyHolder_1.policyHolderSchema);
    return PolicyHolderModel.findOne({})
        .where('confirmationID').equals(confirmationID)
        .exec(function (err, policyHolder) {
        if (!policyHolder) {
            return Promise.reject('Failed to find the requested Policy by Confirmation ID.');
        }
        var policyHolderID = policyHolder.policyHolderID;
        return PolicyModel.findOne({})
            .where('policyHolder.policyHolderID').equals(policyHolderID)
            .exec(function (policyErr, policy) {
            if (!policy) {
                return Promise.reject('Failed to find the requested Policy by Confirmation ID.');
            }
            if (policy.status == 'Unconfirmed') {
                policy.status = 'Confirmed';
                return PolicyModel.update({ _id: policy.id }, policy, function (err) {
                    if (err) {
                        console.log('Failed while attempting to retrieve a specific Policy from the DB, specifically while marking the Policy as Confirmed.');
                        console.log(err);
                        return Promise.reject(err);
                    }
                    return Promise.resolve(policy);
                });
            }
            else {
                return Promise.resolve(policy);
            }
        })
            .catch(function (policyCatchError) {
            console.log('Failed while attempting to retrieve a specific Policy from the DB');
            console.log(err);
            return Promise.reject(err);
        });
    })
        .catch(function (err) {
        console.log('Failed while attempting to retrieve a specific Policy from the DB');
        console.log(err);
        return Promise.reject(err);
    });
};
exports.getConfirmedPolicies = function (db, batchSize) {
    var ClaimModel = db.model("Claim", claim_1.claimSchema);
    var PolicyModel = db.model("Policy", exports.policySchema);
    // Get any 'Confirmed' policies from the DB
    return PolicyModel.find({ 'status': 'Confirmed' }).limit(batchSize)
        .then(function (policies) {
        if (policies) {
            return Promise.resolve(policies);
        }
        else {
            // No confirmed policies
            return Promise.resolve(new Array());
        }
    })
        .catch(function (err) {
        console.log('Failed while attempting to retrieve Confirmed Policies from the DB');
        console.log(err);
        return Promise.reject(err);
    });
};
