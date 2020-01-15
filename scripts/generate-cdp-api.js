/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

const path = require('path');
const fs = require('fs');

function fetch(url) {
  let fulfill, reject;
  const promise = new Promise((res, rej) => {
    fulfill = res;
    reject = rej;
  });
  const driver = url.startsWith('https://') ? require('https') : require('http');
  const request = driver.get(url, response => {
    let data = '';
    response.setEncoding('utf8');
    response.on('data', chunk => data += chunk);
    response.on('end', () => fulfill(data));
    response.on('error', reject);
  });
  request.on('error', reject);
  return promise;
};

function toTitleCase(s) {
  return s[0].toUpperCase() + s.substr(1);
}

async function generate() {
  const jsProtocol = JSON.parse(await fetch('https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/json/js_protocol.json'));
  const browserProtocol = JSON.parse(await fetch('https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/json/browser_protocol.json'));
  const compareDomains = (a, b) => a.domain.toUpperCase() < b.domain.toUpperCase() ? -1 : 1;
  const domains = jsProtocol.domains.concat(browserProtocol.domains).sort(compareDomains);
  const result = [];
  const interfaceSeparator = createSeparator();

  result.push(`// Copyright (c) Microsoft Corporation.`);
  result.push(`// Licensed under the MIT license.`);
  result.push(``);
  result.push(`/****************************************************************`);
  result.push(` * Auto-generated by generate-cdp-api.js, do not edit manually. *`);
  result.push(` ****************************************************************/`);
  result.push(``);
  result.push(`import { IDisposable } from '../common/disposable'; `);
  result.push(``);
  result.push(`export namespace Cdp {`);
  result.push(`  export type integer = number;`);
  interfaceSeparator();

  function appendText(text, indent) {
    if (!text)
      return;
    result.push(`${indent}/**`);
    for (const line of text.split('\n'))
      result.push(`${indent} * ${line}`);
    result.push(`${indent} */`);
  }

  function createSeparator() {
    let first = true;
    return function() {
      if (!first)
        result.push(``);
      first = false;
    }
  }

  function generateType(prop) {
    if (prop.type === 'string' && prop.enum)
      return `${prop.enum.map(value => `'${value}'`).join(' | ')}`;
    if (prop['$ref'])
      return prop['$ref'];
    if (prop.type === 'array') {
      const subtype = prop.items ? generateType(prop.items) : 'any';
      return `${subtype}[]`;
    }
    if (prop.type === 'object')
      return 'any';
    return prop.type;
  }

  function appendProps(props, indent) {
    const separator = createSeparator();
    for (const prop of props) {
      separator();
      appendText(prop.description, indent);
      result.push(`${indent}${prop.name}${prop.optional ? '?' : ''}: ${generateType(prop)};`);
    }
  }

  function appendDomain(domain) {
    const apiSeparator = createSeparator();
    const commands = domain.commands || [];
    const events = domain.events || [];
    const types = domain.types || [];
    const name = toTitleCase(domain.domain);
    interfaceSeparator();
    appendText(`Methods and events of the '${name}' domain.`, '  ');
    result.push(`  export interface ${name}Api {`);
    for (const command of commands) {
      apiSeparator();
      appendText(command.description, '    ');
      result.push(`    ${command.name}(params: ${name}.${toTitleCase(command.name)}Params): Promise<${name}.${toTitleCase(command.name)}Result | undefined>;`);
    }
    for (const event of events) {
      apiSeparator();
      appendText(event.description, '    ');
      result.push(`    on(event: '${event.name}', listener: (event: ${name}.${toTitleCase(event.name)}Event) => void): IDisposable;`);
    }
    result.push(`  }`);

    const typesSeparator = createSeparator();
    interfaceSeparator();
    appendText(`Types of the '${name}' domain.`, '  ');
    result.push(`  export namespace ${name} {`);
    for (const command of commands) {
      typesSeparator();
      appendText(`Parameters of the '${name}.${command.name}' method.`, '    ');
      result.push(`    export interface ${toTitleCase(command.name)}Params {`);
      appendProps(command.parameters || [], '      ');
      result.push(`    }`);
      typesSeparator();
      appendText(`Return value of the '${name}.${command.name}' method.`, '    ');
      result.push(`    export interface ${toTitleCase(command.name)}Result {`);
      appendProps(command.returns || [], '      ');
      result.push(`    }`);
    }
    for (const event of events) {
      typesSeparator();
      appendText(`Parameters of the '${name}.${event.name}' event.`, '    ');
      result.push(`    export interface ${toTitleCase(event.name)}Event {`);
      appendProps(event.parameters || [], '      ');
      result.push(`    }`);
    }
    for (const type of types) {
      typesSeparator();
      appendText(type.description, '    ');
      if (type.type === 'object') {
        result.push(`    export interface ${toTitleCase(type.id)} {`);
        if (type.properties)
          appendProps(type.properties, '      ');
        else
          result.push(`      [key: string]: any;`);
        result.push(`    }`);
      } else {
        result.push(`    export type ${toTitleCase(type.id)} = ${generateType(type)};`);
      }
    }
    result.push(`  }`);
  }

  function appendPauseResume() {
    result.push(`    /**`);
    result.push(`     * Pauses events being sent through the aPI.`);
    result.push(`     */`);
    result.push(`    pause(): void;`);
    result.push(`    /**`);
    result.push(`     * Resumes previously-paused events`);
    result.push(`     */`);
    result.push(`    resume(): void;`);
  }

  interfaceSeparator();
  appendText('Protocol API.', '  ');
  result.push(`  export interface Api {`);
  appendPauseResume();
  domains.forEach(d => {
    result.push(`    ${d.domain}: ${d.domain}Api;`)
  });
  result.push(`  }`);

  domains.forEach(d => appendDomain(d));

  result.push(`}`);
  result.push(``);
  result.push(`export default Cdp;`);
  result.push(``);

  const fileName = path.join(__dirname, '../src/cdp/api.d.ts');
  fs.writeFileSync(fileName, result.join('\n'), {encoding: 'utf-8'});
}

generate();

