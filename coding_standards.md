# Coding Standards

* Console log raw objects like this: `console.log('Response:', response.data)`. DON'T stringify result objects like this: `console.log('Response:', JSON.stringify(response.data, null, 2))`. 
* This project uses Yarn, not NPM.