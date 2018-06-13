/// <reference types="mongoose" />
import { Document, Schema } from 'mongoose';
export interface IWeatherData {
    timeRecordedISOString: string;
    weatherLocation: string;
    latitude: Number;
    longitude: Number;
    highTempLast24Hours: Number;
    rainLast24Hours: Number;
    cloudsLast24Hours: Number;
    highWaveLast24Hours: Number;
}
export interface IWeatherDataModel extends IWeatherData, Document {
}
export declare var weatherDataSchema: Schema;
