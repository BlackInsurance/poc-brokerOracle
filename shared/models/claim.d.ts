/// <reference types="mongoose" />
import { Document, Schema } from 'mongoose';
export interface IClaim {
    claimID: string;
    claimDateISOString: String;
    highTempLast24Hours: Number;
    rainLast24Hours: Number;
    cloudsLast24Hours: Number;
    highWaveLast24Hours: Number;
    settlement: {
        paymentID: String;
        from: string;
        to: string;
        amount: Number;
        dateISOString: String;
        approved: Boolean;
    };
}
export interface IClaimModel extends IClaim, Document {
}
export interface IClaimSubmission {
    policyID: string;
    rainLast24Hours: Number;
    cloudsLast24Hours: Number;
    highTempLast24Hours: Number;
    highWaveLast24Hours: Number;
}
export declare var claimSchema: Schema;
