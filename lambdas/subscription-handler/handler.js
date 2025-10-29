// handler.js
const AWS = require('aws-sdk');
const Joi = require('joi');

const ddb = new AWS.DynamoDB.DocumentClient();
const TABLE = process.env.SUBSCRIBERS_TABLE || 'Subscribers';

const subscribeSchema = Joi.object({
    email: Joi.string().email().required(),
    phone: Joi.string().pattern(/^\+?[0-9]{7,15}$/).optional().allow('', null),
    city: Joi.string().optional().default('Mumbai'),
    countryCode: Joi.string().length(2).optional().default('IN')
});

exports.handler = async function (event) {
    console.log('Event:', event);
    try {
        // Support both payload shapes (SAM/API Gateway v2 or other)
        const path = (event.requestContext && event.requestContext.http && event.requestContext.http.path) || event.path || (event.requestContext && event.path) || '';
        const body = event.body ? JSON.parse(event.body) : {};

        if (path.endsWith('/subscribe')) {
            const { error, value } = subscribeSchema.validate(body);
            if (error) return buildResponse(400, { message: error.details[0].message });

            const item = {
                email: value.email.toLowerCase(),
                phone: value.phone || null,
                city: value.city,
                countryCode: value.countryCode,
                subscribed: true,
                createdAt: new Date().toISOString()
            };

            await ddb.put({ TableName: TABLE, Item: item }).promise();
            return buildResponse(200, { message: 'Subscribed', item });
        }

        if (path.endsWith('/unsubscribe')) {
            const { email } = body;
            if (!email) return buildResponse(400, { message: 'email is required' });
            const key = { email: email.toLowerCase() };
            await ddb.update({
                TableName: TABLE,
                Key: key,
                UpdateExpression: 'SET subscribed = :s',
                ExpressionAttributeValues: { ':s': false }
            }).promise();
            return buildResponse(200, { message: 'Unsubscribed' });
        }

        if (path.endsWith('/health')) {
            return buildResponse(200, { status: 'ok' });
        }

        return buildResponse(404, { message: 'Not Found' });
    } catch (err) {
        console.error(err);
        return buildResponse(500, { message: 'Server Error' });
    }
};

function buildResponse(status, body) {
    return {
        statusCode: status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(body)
    };
}
