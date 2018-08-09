"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var CORE_DATA_MODEL = /** @class */ (function () {
    function CORE_DATA_MODEL() {
    }
    CORE_DATA_MODEL.getDefaultPolicy = function () {
        return {
            policyID: '',
            product: {
                productID: 'RAINY_DAY_INSURANCE',
                creator: 'BLACK_INSURANCE_MANAGER',
                name: 'Rainy Day Insurance',
                description: 'Insurance that will pay you 1 BLCK token each day that the city covered by an active Policy receives 10mm or more of rain within a 24 hour period.  Max coverage of 100 BLCK for any single Policy.',
                productDetailURL: 'https://wwww.black.insure/'
            },
            issuingBroker: {
                participantID: 'BROKER',
                type: 'Broker',
                email: 'poc@black.insure',
                balanceBLCK: 0
            },
            policyHolder: this.getDefaultPolicyHolder(),
            status: 'Unconfirmed',
            createDateISOString: (new Date()).toISOString(),
            startDateISOString: (new Date()).toISOString(),
            endDateISOString: (new Date('11-01-2018')).toISOString(),
            lastClaimDateISOString: '',
            coveredCity: {
                name: '',
                latitude: 0.0,
                longitude: 0.0
            },
            ethereumAddress: '',
            claims: undefined
        };
    };
    CORE_DATA_MODEL.getDefaultPolicyHolder = function () {
        return {
            policyHolderID: '',
            email: '',
            password: '',
            balanceBLCK: 0,
            confirmationID: '',
            facebook: {
                id: '',
                token: '',
                name: '',
                email: ''
            },
            google: {
                id: '',
                token: '',
                name: '',
                email: ''
            }
        };
    };
    return CORE_DATA_MODEL;
}());
exports.CORE_DATA_MODEL = CORE_DATA_MODEL;
