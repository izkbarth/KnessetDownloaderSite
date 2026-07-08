# משתמשים באימג' רשמי של Node שכולל כבר את כרום מותקן מראש עבור Puppeteer
FROM ghcr.io/puppeteer/puppeteer:21.5.0

# הגדרת תיקיית העבודה בתוך השרת
WORKDIR /usr/src/app

# העתקת קבצי ההגדרות והתקנת הספריות
COPY package*.json ./
RUN npm ci

# העתקת שאר קבצי הקוד של האתר (index.html, server.js)
COPY . .

# חשיפת הפורט של השרת
EXPOSE 3000

# פקודת ההרצה של האתר
CMD [ "node", "server.js" ]