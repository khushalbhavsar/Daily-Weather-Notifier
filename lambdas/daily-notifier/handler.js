// handler.js for Daily Notifier
const AWS = require('aws-sdk');
const axios = require('axios');

const ddb = new AWS.DynamoDB.DocumentClient();
const ssm = new AWS.SSM();
const ses = new AWS.SES({ apiVersion: '2010-12-01' });
const sns = new AWS.SNS();

const TABLE = process.env.SUBSCRIBERS_TABLE || 'Subscribers';
const SSM_WEATHER_PARAM = process.env.SSM_WEATHER_PARAM || '/daily-weather-notifier/weather-api-key';
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL;

async function getWeatherApiKey() {
    const resp = await ssm.getParameter({ Name: SSM_WEATHER_PARAM, WithDecryption: true }).promise();
    return resp.Parameter.Value;
}

async function fetchWeatherFor(location, apiKey) {
    const q = location.countryCode ? `${location.city},${location.countryCode}` : location.city;
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(q)}&units=metric&appid=${apiKey}`;
    const r = await axios.get(url, { timeout: 10000 });
    return r.data;
}

function buildEmailSubject(data) {
    return `Weather Update — ${data.name}: ${Math.round(data.main.temp)}°C`;
}

function buildEmailHtml(data) {
    return `
    <h2>Weather for ${data.name}</h2>
    <p><strong>${data.weather[0].main}</strong> — ${data.weather[0].description}</p>
    <ul>
      <li>Temp: ${data.main.temp} °C (feels like ${data.main.feels_like} °C)</li>
      <li>Humidity: ${data.main.humidity}%</li>
      <li>Wind: ${data.wind.speed} m/s</li>
    </ul>
    <p>Have a great day!</p>
  `;
}

async function sendEmail(to, subject, html) {
    if (!SES_FROM_EMAIL) throw new Error('SES_FROM_EMAIL env var is not set');
    const params = {
        Destination: { ToAddresses: [to] },
        Message: {
            Body: { Html: { Charset: 'UTF-8', Data: html }, Text: { Charset: 'UTF-8', Data: html.replace(/<[^>]+>/g, '') } },
            Subject: { Charset: 'UTF-8', Data: subject }
        },
        Source: SES_FROM_EMAIL
    };
    return ses.sendEmail(params).promise();
}

async function sendSMS(phone, message) {
    return sns.publish({ PhoneNumber: phone, Message: message }).promise();
}

exports.handler = async function (event) {
    console.log('Event:', JSON.stringify(event));
    try {
        const apiKey = await getWeatherApiKey();
        const resp = await ddb.scan({ TableName: TABLE, FilterExpression: 'subscribed = :s', ExpressionAttributeValues: { ':s': true } }).promise();
        const items = resp.Items || [];
        console.log('Subscribers count:', items.length);

        for (const sub of items) {
            try {
                const loc = { city: sub.city || 'Mumbai', countryCode: sub.countryCode || 'IN' };
                const weather = await fetchWeatherFor(loc, apiKey);
                const subject = buildEmailSubject(weather);
                const html = buildEmailHtml(weather);

                if (sub.email) {
                    await sendEmail(sub.email, subject, html);
                    console.log(`Email sent to ${sub.email}`);
                }

                if (sub.phone) {
                    const text = `${weather.name}: ${Math.round(weather.main.temp)}°C, ${weather.weather[0].main}`;
                    await sendSMS(sub.phone, text);
                    console.log(`SMS sent to ${sub.phone}`);
                }

            } catch (userErr) {
                console.error('Failed to notify user', sub.email || sub.phone, userErr);
            }
        }

        return { statusCode: 200, body: 'Notifications processed' };
    } catch (err) {
        console.error('Fatal error', err);
        throw err;
    }
};
