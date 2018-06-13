/// <reference types="mongoose" />
import { Document, Schema } from 'mongoose';
export interface IPolicyHolder {
    policyHolderID: string;
    email: string;
    password: string;
    balanceBLCK: Number;
    confirmationID: string;
    facebook: {
        id: string;
        token: string;
        name: string;
    };
}
export interface IPolicyHolderModel extends IPolicyHolder, Document {
}
export declare var policyHolderSchema: Schema;
