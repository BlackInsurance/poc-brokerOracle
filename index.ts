
import { BusinessNetworkConnection } from 'composer-client';
import * as express from "express";
import { Application, NextFunction, Request, Response, Router } from "express";
import * as mongoose from 'mongoose';
import * as querystring from 'querystring';
import * as http from 'http';
import * as fs from 'fs';
import { google } from 'googleapis';

import * as bodyParser from "body-parser";
import * as cookieParser from "cookie-parser";
import * as errorHandler from 'errorhandler';
import * as methodOverride from 'method-override';
import * as logger from "morgan";
import * as path from "path";

import * as passport from 'passport';
import { Strategy, ExtractJwt } from 'passport-jwt';


// Data Models
import { CORE_DATA_MODEL } from './shared/models/model';
import { IClaim, IClaimModel, claimSchema } from './shared/models/claim';
import { IPolicy, IPolicyModel, policySchema } from './shared/models/policy';
import * as claimDataModel from './shared/models/claim';
import * as policyDataModel from './shared/models/policy';
import { OAuth2Client } from 'google-auth-library';
import { IPolicyHolder } from './shared/models/policyHolder';
import { Credentials } from 'google-auth-library/build/src/auth/credentials';



let BrokerOracleConfig = {
    BROKER_CARD_NAME: 'broker@black-poc',
    MONGODB_CONNECTION: process.env.MONGODB_URI || 'mongodb://127.0.0.1/poc',
    CHAINCODE_NAMESPACE: 'insure.black.poc',
    JWT_AUTHORIZATION_SECRET: process.env.JWT_AUTHORIZATION_SECRET || 'secret',
    INSURANCE_PRODUCT_ID: 'RAINY_DAY_INSURANCE',
    GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_ID,
    POLICY_BATCH_SIZE: 1,
    PROCESS_LOOP_INTERVAL_MS: 5000
};


/**
 * Microservice for listening to Blockchain events and updating the DB
 * @class BrokerOracle
 */
export class BrokerOracle {

    private app: Application;

    private networkConnection?: BusinessNetworkConnection;
    private networkDefinition: any;

    private db?: mongoose.Connection;
    private policyModel?: mongoose.Model<IPolicyModel>;
    private claimModel?: mongoose.Model<IClaimModel>;

    private currentConfirmedPolicies: IPolicy[] = new Array();
    private policiesInProcess: IPolicy[] = new Array();

    private serviceConfig: any;

    private blockchainEventListener: any;

    public HALT_LISTENING: boolean = true;
    public HALT_PROCESSING: boolean = true;



    /**
     * Bootstrap the application.
     *
     * @class BrokerOracle
     * @method bootstrap
     * @static
     * @return {ng.auto.IInjectorService} Returns the newly created injector for this app.
     */
    public static bootstrap(): BrokerOracle {
        return new BrokerOracle();
    }


    constructor() {    
        //create expressjs application
        this.app = express();

        this.config();

        this.routes();
    }


    /**
     * Configure application
     *
     * @class Server
     * @method config
     */
    public config() {
        //add static paths
        this.app.use(express.static(path.join(__dirname, "./public")));
    
        //use logger middlware
        this.app.use(logger("dev"));

        //enable CORS for different OAuth protocols between UI and server
        //this.app.use(cors());
    
        //use json form parser middlware
        this.app.use(bodyParser.json());
    
        //use query string parser middlware
        this.app.use(bodyParser.urlencoded({extended: true}));
    
        //use override middlware
        this.app.use(methodOverride());

        //catch 404 and forward to error handler
        this.app.use(function(err: any, req: express.Request, res: express.Response, next: express.NextFunction) {
            err.status = 404;
            next(err);
        });

        //error handling
        this.app.use(errorHandler());




    
        // prepare to connect to the blockchain and db
        this.networkConnection = new BusinessNetworkConnection();
        
        // retrieve the configuration for the micro-service
        this.serviceConfig = BrokerOracleConfig;

        try{
            // Connect to the Blockchain
            this.networkConnection.connect(this.serviceConfig.BROKER_CARD_NAME)
            .then( (connectedNetworkDefinition: any) => {
                this.networkDefinition = connectedNetworkDefinition;
            });

            // Connect to the DB
            this.db = mongoose.createConnection(this.serviceConfig.MONGODB_CONNECTION);

            //create models
            this.policyModel = this.db.model("Policy", policySchema);
            this.claimModel = this.db.model("Claim", claimSchema);
            
            // Load the ability to understand / communicate JWT in Passport for request authorisation 
            passport.use(new Strategy({
                jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
                secretOrKey: this.serviceConfig.JWT_AUTHORIZATION_SECRET
            },
            (jwtPayload:any, cb:any) => { return cb(null, jwtPayload); }
            ));

        } catch (err) {
            console.log('Failed to configure connections with the Blockchain and Database');
            throw err;
        }
    }

    /**
     * Create router
     *
     * @class BrokerOracle
     * @method routes
     */
    public routes() {
        //add default route, to get current status
        this.app.get('/', passport.authenticate('jwt', {session:false}), (req: Request, res: Response, next: NextFunction) => {
            this.status(req, res, next);
        });

        //add start processing route
        this.app.post('/start', passport.authenticate('jwt', {session:false}), (req: Request, res: Response, next: NextFunction) => {
            this.startProcessing(req, res, next);
            this.status(req, res, next);
        });

        //add stop processing route
        this.app.post('/stop', passport.authenticate('jwt', {session:false}), (req: Request, res: Response, next: NextFunction) => {
            this.stopProcessing(req, res, next);
            this.status(req, res, next);
        });
    }






    /**
     * The status route.
     *
     * @class BrokerOracle
     * @method status
     * @param req {any} The express Request object.
     * @param res {Response} The express Response object.
     * @next {NextFunction} Execute the next method.
     */
    private status(req: any, res: Response, next: NextFunction) {
        return res.json({
            "confirmedPolicyProcessor": (!this.HALT_PROCESSING), 
            "blockchainListener" : (!this.HALT_LISTENING),
            "confirmedPolicies":this.currentConfirmedPolicies.length,
            "inProcessPolicies":this.policiesInProcess.length
        });
    }

    /**
     * The startProcessing route.
     *
     * @class BrokerOracle
     * @method startProcessing
     * @param req {any} The express Request object.
     * @param res {Response} The express Response object.
     * @next {NextFunction} Execute the next method.
     */
    private startProcessing(req: any, res: Response, next: NextFunction) {
        this.setListenForBlockchainEvents(true);

        this.HALT_PROCESSING = false;
        setImmediate(()=>{return this.processConfirmedPolicies();});
    }

    /**
     * The stopProcessing route.
     *
     * @class BrokerOracle
     * @method stopProcessing
     * @param req {any} The express Request object.
     * @param res {Response} The express Response object.
     * @next {NextFunction} Execute the next method.
     */
    private stopProcessing(req: any, res: Response, next: NextFunction) {
        this.HALT_PROCESSING = true;
        this.setListenForBlockchainEvents(false);
    }

    private setListenForBlockchainEvents(shouldListenForBlockchainEvents: boolean = true){
        if ( this.networkConnection == undefined ){ return; }

        if ( shouldListenForBlockchainEvents ) {
            this.HALT_LISTENING = false;
            this.blockchainEventListener = this.networkConnection.on('event', (evt: any) => {
                this.processBlockchainEvent(evt)
                    .then( (success: any) => {
                        if (!success){
                            console.log('WARNING: Did not process a captured event');
                        }
                    }).catch( (eventError: any) => {
                        console.log('ERROR: failed to process an event');
                        console.log(eventError);
                    });
            });
            this.networkConnection.on('error', (blockchainError: any) => {
                console.log('ERROR: received an error from the Blockchain');
                console.log(blockchainError);
            });
        } else {
            this.networkConnection.removeAllListeners();
            this.blockchainEventListener = null;
            this.HALT_LISTENING = true;
        }
    }




    private processConfirmedPolicies(){
        if (this.db == undefined){return Promise.reject('DB connection is not initialized.');}

        return policyDataModel.getConfirmedPolicies(this.db, this.serviceConfig.POLICY_BATCH_SIZE)
            .then((confirmedPolicies:any[]) : Promise<boolean> => {
                if ( confirmedPolicies != null && confirmedPolicies.length > 0){
                    this.currentConfirmedPolicies = confirmedPolicies;

                    return this.processNextBatchOfConfirmedPolicies()
                        .then((success:any) => {
                            if ( ! this.HALT_PROCESSING ) { 
                                setTimeout(()=>{ return this.processConfirmedPolicies();}, this.serviceConfig.PROCESS_LOOP_INTERVAL_MS);
                            }
                            return Promise.resolve(true);
                        })
                        .catch((processLoopError:any) => {
                            console.log('Failed while processing a confirmed policy in the DB destined for Blockchain.');
                            console.log(processLoopError);
                            return Promise.reject(processLoopError);
                        });                
                } else {
                    this.currentConfirmedPolicies = new Array();
                    if ( ! this.HALT_PROCESSING ) { 
                        setTimeout(()=>{ return this.processConfirmedPolicies();}, this.serviceConfig.PROCESS_LOOP_INTERVAL_MS);
                    }
                    return Promise.resolve(true);
                }
            })
            .catch((listRetrievalError:any) => {
                this.HALT_PROCESSING = true;
                console.log('Failed while retrieving a list of confirmed policies from the DB.');
                console.log(listRetrievalError);
                return Promise.reject(listRetrievalError);
            });    
    }

    private processNextBatchOfConfirmedPolicies() : Promise<any>{
        // Make sure the current confirmed policies list is not empty
        if ( this.currentConfirmedPolicies.length == 0 ){
            console.log('WARNING: No Confirmed Policies.');
            return Promise.resolve(false);
        }
        if ( this.networkConnection == undefined ){
            console.log('WARNING: The Network Connection is not initialized.');
            return Promise.resolve(false);
        }
        if ( this.policyModel == undefined ){
            console.log('WARNING: The DB Connection and object models are not initialized.');
            return Promise.resolve(false);
        }

        let factory = this.networkDefinition.getFactory();
        let newPolicyHolders = new Array();
        let newPolicyTransactions = new Array();
        let currentBatchOfConfirmedPolicies = this.currentConfirmedPolicies.slice();
            


        return Promise.all([
            this.networkConnection.getAssetRegistry(this.serviceConfig.CHAINCODE_NAMESPACE + '.Policy'),
            this.networkConnection.getParticipantRegistry(this.serviceConfig.CHAINCODE_NAMESPACE + '.PlatformUser')
        ]).then( (registries) => {
            let policyRegistry = registries[0];
            let platformUserRegistry = registries[1];

            let policyBatchSize = ( this.serviceConfig.POLICY_BATCH_SIZE < this.currentConfirmedPolicies.length ) ? this.serviceConfig.POLICY_BATCH_SIZE : this.currentConfirmedPolicies.length;
            newPolicyHolders = new Array(policyBatchSize);
            newPolicyTransactions = new Array(policyBatchSize);
            console.log('Issuing ' + policyBatchSize + ' new Policies on the Blockchain');
            
            // Loop through the current confirmed policies up to the batch size limit (keep grabbing index 0, popping it at the end of the loop, for the entire batch)
            let dbUpdatePromises = new Array(policyBatchSize);
            for(let i = 0; i < policyBatchSize; policyBatchSize--){
                if (this.HALT_PROCESSING) { return Promise.resolve(true); }

                let currentConfirmedPolicy = this.currentConfirmedPolicies.shift(); 
                if (currentConfirmedPolicy == undefined) { continue; }   

                // Create the PolicyHolder and add it to the current batch (assume the policyHolderID is unique)
                newPolicyHolders[i] = factory.newResource(this.serviceConfig.CHAINCODE_NAMESPACE, 'PlatformUser', currentConfirmedPolicy.policyHolder.policyHolderID);
                newPolicyHolders[i].type = "PolicyHolder";

                // Create a new 'IssueNewPolicy' transaction and add it to the current batch
                newPolicyTransactions[i] = factory.newResource(this.serviceConfig.CHAINCODE_NAMESPACE, 'IssueNewPolicy', 'IssueNewPolicy_'+currentConfirmedPolicy.policyID);
                newPolicyTransactions[i].policyID = currentConfirmedPolicy.policyID;
                newPolicyTransactions[i].startDateISOString = currentConfirmedPolicy.startDateISOString;
                newPolicyTransactions[i].endDateISOString = currentConfirmedPolicy.endDateISOString;
                newPolicyTransactions[i].coveredCity = currentConfirmedPolicy.coveredCity.name;
                newPolicyTransactions[i].latitude = currentConfirmedPolicy.coveredCity.latitude;
                newPolicyTransactions[i].longitude = currentConfirmedPolicy.coveredCity.longitude;
                newPolicyTransactions[i].productID = this.serviceConfig.INSURANCE_PRODUCT_ID;
                newPolicyTransactions[i].policyHolderID = currentConfirmedPolicy.policyHolder.policyHolderID;

                // Modify the current Policy status to 'Waiting for Blockchain Confirmation'
                currentConfirmedPolicy.status = 'Waiting for Blockchain Confirmation';
                this.policiesInProcess[this.policiesInProcess.length] = currentConfirmedPolicy;                

                // Update the DB (we will wait for an event to come back from the Blockchain confirming the transaction is complete before we continue)
                try{     
                    if(this.policyModel == undefined){
                        console.log('WARNING: Did not process any Confirmed Policies.');
                        return Promise.resolve(false);
                    }
                    dbUpdatePromises[i] = this.policyModel.findOneAndUpdate({policyID: currentConfirmedPolicy.policyID }, currentConfirmedPolicy);
                }catch(dbUpdateError){
                    console.log('Failed while attempting to update status for a Confirmed Policy in the DB');
                    console.log(dbUpdateError);
                    return Promise.reject(dbUpdateError);
                }
            }

            let newPolicyPromises = new Array(newPolicyTransactions.length);
            return Promise.all(dbUpdatePromises)
                .then( (updatedPoliciesInDB) => {
                    if (this.HALT_PROCESSING) { return Promise.resolve(true); }
                    
                    // Create all the new PolicyHolder PlatformUsers in the Blockchain
                    return platformUserRegistry.addAll(newPolicyHolders);
                }).then( (createdPlatformUsers) => {
                    if ( this.networkConnection == undefined ){
                        console.log('WARNING: The Network Connection is not initialized.');
                        return Promise.reject('WARNING: The Network Connection is not initialized.');
                    }

                    // Execute each 'IssueNewPolicy' transaction individually on the Blockchain                    
                    for(let j = 0; j < newPolicyPromises.length; j++){
                        newPolicyPromises[j] = this.networkConnection.submitTransaction(newPolicyTransactions[j]);
                    }

                    return Promise.all(newPolicyPromises);
                }).then( (createdPolicies) => {
                    if (this.HALT_PROCESSING) { return Promise.resolve(true); }
                    console.log('Successfully issued ' + newPolicyTransactions.length + ' new Policies on the Blockchain');

                    // Clear the polices that were in-process
                    this.policiesInProcess = new Array();

                    // Add all the policies to Google Sheets
                    return this.appendPoliciesToGoogleSheets(currentBatchOfConfirmedPolicies);
                }).then( (result:any) => {
                    // Do the next batch or exit
                    if ( this.currentConfirmedPolicies.length > 0 ){
                        return this.processNextBatchOfConfirmedPolicies();
                    } else {
                        return Promise.resolve(true);
                    }
                }).catch( (confirmedPolicySyncExecutionError) => {
                    console.log('Failed to execute the sync of Confirmed Policies.');
                    console.log(confirmedPolicySyncExecutionError);
                    return Promise.reject(confirmedPolicySyncExecutionError);
                });
        }).catch( (confirmedPolicySyncSetupError) => {
            console.log('Failed to setup and sync Confirmed Policies.');
            console.log(confirmedPolicySyncSetupError);
            return Promise.reject(confirmedPolicySyncSetupError);
        });
    }

    private processBlockchainEvent(eventDetails: any){
        let eventType = eventDetails.$type;
        switch (eventType){
            case 'NewPolicyIssued':
                console.log('Received a NewPolicyIssued event');
                let newPolicy_policyID = eventDetails.policyID;

                if (this.db == undefined){return Promise.reject('ERROR: DB connection is not initialized.');}

                return policyDataModel.getPolicyFromDB(this.db, newPolicy_policyID)
                    .then( (policy: any) => {
                        if ( policy == null ){
                            console.log('ERROR: Cannot find the requested policyID in the DB');
                            return Promise.reject('ERROR: Cannot find the requested policyID in the DB');
                        }

                        policy.status = 'Active';

                        return policy.save();
                    }).then( (policyErr: any) => {
                        return Promise.resolve(true);
                    }).catch( (dbLookupError: any) => {
                        console.log('ERROR: Failed to save a new Policy to the DB.  PolicyID : ' + newPolicy_policyID);
                        return Promise.reject(dbLookupError);
                    });

            case 'ClaimSubmitted':
                console.log('Received a ClaimSubmitted event');
                let submittedClaim_policyID = eventDetails.policyID;

                if (this.db == undefined){return Promise.reject('ERROR: DB connection is not initialized.');}

                return policyDataModel.getPolicyFromDB(this.db, submittedClaim_policyID)
                    .then( (policy: any) => {
                        if ( policy == null ){
                            console.log('ERROR: Cannot find the requested policyID in the DB');
                            return Promise.reject('ERROR: Cannot find the requested policyID in the DB');
                        }

                        if (policy.claims == null){policy.claims = new Array();}

                        let newClaim = policy.claims.create({
                            claimID: eventDetails.claimID,
                            claimDateISOString: eventDetails.claimDateISOString,
                            highTempLast24Hours: eventDetails.highTempLast24Hours,
                            rainLast24Hours: eventDetails.rainLast24Hours,
                            cloudsLast24Hours: eventDetails.cloudsLast24Hours,
                            highWaveLast24Hours: eventDetails.highWaveLast24Hours,
                            settlement: {
                                paymentID: eventDetails.settlementPaymentID,
                                from: eventDetails.paidFrom,
                                to: eventDetails.paidTo,
                                amount: eventDetails.amount,
                                approved: eventDetails.approved,
                                dateISOString: eventDetails.settlementDateISOString
                            }
                        });
                        policy.claims.push(newClaim);
                        policy.lastClaimDateISOString = newClaim.claimDateISOString;

                        return policy.save();
                    }).then( (result:any) => {
                        return this.appendClaimToGoogleSheets(eventDetails);
                    }).then( (result:any) => {
                        return Promise.resolve(true);
                    }).catch( (dbLookupError: any) => {
                        console.log('ERROR: Failed to save a new Policy to the DB.  PolicyID : ' + submittedClaim_policyID);
                        return Promise.reject(dbLookupError);
                    });
            case 'ClaimSettled':
                console.log('Received a ClaimSettled event');
                let settledClaim_policyID = eventDetails.policyID;

                if (this.db == undefined){return Promise.reject('ERROR: DB connection is not initialized.');}

                return policyDataModel.getPolicyFromDB(this.db, settledClaim_policyID)
                    .then( (policy: any) => {
                        if ( policy == null ){
                            console.log('ERROR: Cannot find the requested policyID in the DB');
                            return Promise.reject('ERROR: Cannot find the requested policyID in the DB');
                        }

                        if (policy.claims == null || policy.claims.length == 0){
                            console.log('ERROR: Cannot find the settled Claim associated with the Policy. '+settledClaim_policyID);
                            return Promise.reject('ERROR: Cannot find the settled Claim associated with the Policy. '+settledClaim_policyID);
                        }

                        let settledClaimIndex : number = policy.claims.findIndex((value:any)=>{ return value.claimID==eventDetails.claimID;});

                        if (settledClaimIndex < 0){
                            console.log('ERROR: Cannot find the settled Claim associated with the Policy. '+settledClaim_policyID);
                            return Promise.reject('ERROR: Cannot find the settled Claim associated with the Policy. '+settledClaim_policyID);
                        }

                        if (policy.claims[settledClaimIndex].settlement == null || policy.claims[settledClaimIndex].settlement.paymentID != eventDetails.settlementPaymentID){
                            console.log('ERROR: Cannot find the Claim SettlementPayment associated with the Policy. '+settledClaim_policyID);
                            return Promise.reject('ERROR: Cannot find the Claim SettlementPayment associated with the Policy. '+settledClaim_policyID);
                        }

                        // Update the settle claim and save to the database
                        policy.claims[settledClaimIndex].settlement.approved = eventDetails.approved;
                        policy.claims[settledClaimIndex].settlement.dateISOString = eventDetails.settlementDateISOString;
                        return policy.save();
                    }).catch( (dbLookupError: any) => {
                        console.log('ERROR: Failed to save a new Policy to the DB.  PolicyID : ' + submittedClaim_policyID);
                        return Promise.reject(dbLookupError);
                    });                
            default:
                console.log('WARNING: Received an unknown event : ' + eventType);
                return Promise.resolve(false);
        }
    }


    private appendClaimToGoogleSheets(claimDetails: any){
        let values = [
            [
                claimDetails.policyID,
                (new Date()).toISOString(),
                claimDetails.rainLast24Hours
            ]
        ];
        let request = {
            spreadsheetId: this.serviceConfig.GOOGLE_SHEET_ID,
            range: 'Claims!A1:C1',
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            resource : { values }
        };

        this.updateGoogleSheets(request);        
    }

    private appendPoliciesToGoogleSheets(policiesArray: any){
        return new Promise( (resolve, reject) => {          
            if (policiesArray.length && policiesArray.length > 0){
                for(let i = 0; i < policiesArray.length; i++){    
                    
                    let usedFacebook = (policiesArray[i].policyHolder.facebook.id != '');
                    let usedGoogle = (policiesArray[i].policyHolder.google.id != '');
                    let usedEmail = (policiesArray[i].policyHolder.email != '');
                    let policyHolderName = (usedEmail) ? policiesArray[i].policyHolder.email : 
                                            (usedFacebook) ? policiesArray[i].policyHolder.facebook.name : policiesArray[i].policyHolder.google.name;
                    let policyHolderEmail = (usedEmail) ? policiesArray[i].policyHolder.email : 
                                            (usedFacebook) ? policiesArray[i].policyHolder.facebook.email : policiesArray[i].policyHolder.google.email;

                    let values = [
                        [
                            (new Date()).toISOString(),
                            policiesArray[i].coveredCity.name,
                            policyHolderName,
                            usedFacebook,
                            usedGoogle,
                            usedEmail,
                            policyHolderEmail,
                            policiesArray[i].policyID
                        ]
                    ];
                    let request = {
                        spreadsheetId: this.serviceConfig.GOOGLE_SHEET_ID,
                        range: 'PolicyHolders!A1:H1',
                        valueInputOption: 'RAW',
                        insertDataOption: 'INSERT_ROWS',
                        resource : { values }
                    };

                    this.updateGoogleSheets(request);
                }
            }    
            resolve(true);        
        });
    }

    private updateGoogleSheets(request: any){
        // Load client secrets from a local file.
        fs.readFile('credentials.json', 'utf8', (err, content) => {
            if (err) return console.log('Error loading client secret file:', err);

            // Authorize a client with credentials, then call the Google Sheets API.
            const credentials = JSON.parse(content);
            const {client_secret, client_id, redirect_uris} = credentials.installed;
            const oAuth2Client = new google.auth.OAuth2(
                client_id, client_secret, redirect_uris[0]);

            // Load the access token
            fs.readFile('token.json', 'utf8', (err, token) => {
                if (err) return console.log('Google Sheets access token is missing');

                let creds : Credentials = JSON.parse(token);
                oAuth2Client.setCredentials(creds);

                // Extend the request with the OAuth2 client and an access token
                request.auth = oAuth2Client;
                request.access_token = creds.access_token;

                const sheets = google.sheets({version: 'v4', oAuth2Client});
                sheets.spreadsheets.values.append(request, (err:any, result:any) => {
                    if (err) {
                        console.log(err);
                    } else {
                        console.log('Google Sheet record appended.');
                    }
                });
            });
        });
    }


}
