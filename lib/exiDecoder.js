/*
 * Copyright (C) 2015 Youenn Fablet (youennf@gmail.com).
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:

 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 */

/*
 This is a partial EXI decoder implementation.
 It supports more or less bit-packed, byte-aligned and pre-compression mode, schema-informed and built-in grammars.
 Typed data decoding is partially supported as well.
 
 TODO: 
 Support missing features:
	preserve lexical values
	preserve prefixes
	exi:gYear, exi:gYearMonth, exi:date, exi:dateTime, exigMonth, exi:gMonthDay, exi:gDay, exi:time
	add error messages
	handle EXI header
	add compression mode support (precompression already supported)
 Test, debug and fix
    A lot to do here I guess
 Refactoring
    Use modern JS
	Split into several files: low level byte/bit routines, string tables
*/

function EXIDecoder(bytes, knowledge, isStrict) {
    this.errorId = 0;
    this.errorMsg = "";
    this.setError = function(id, msg) {
        this.errorId = id;
        this.errorMsg = msg;
    }
    this.getErrorID = function() {
        return this.errorId;
    }
    this.clearError = function() {
        this.errorId = 0;
        this.errorMsg = "";
    }

    if (bytes[0] == 128 || bytes[0] == 144 || bytes[0] == 145) {
        this.index = 1;
        this.bytes = bytes;
        this.current = bytes[1];
        this.availableBits = 0;
    }
    else {
        // invalid EXI stream
        this.setError(-1, "bad EXI stream");
        return;
    }

    this.getNameLvtID = function(uri, name) {
        var lvtID = 0;
        for (var i = 0; i < this.knowledge.uris.length; i++) {
            if (uri == this.knowledge.uris[i].uri) {
                var names =this.knowledge.uris[i].names;
                for (var j = 0; j < names.length; j++) {
                    if (name == names[j].name) {
                        return names[j].lvtID;
                    }
                }
                break;
            }
        }
        return -1;
    }

    this.globalValues = { "indexSize": 0, "values": [] };
    this.localValues = [];
    /* init knowledge */
    this.initKnowledge = function(knowledge) {
        this.knowledge = knowledge;
        if (knowledge == null) {
            this.knowledge = {
                "predefinedElementNumber": 0,
                "attributes": [],
                "elements": [],
                "uris": [null, null, null],
                "grammars": [],
                "simpleTypes": {}
            };
        }        
        // initialize the uri entries
        if (this.knowledge.uris.length > 0) {
            var finalTable, table;
            if (this.knowledge.uris[0] == null) {
                this.knowledge.uris[0] = { "uri": "", "names": [] };
            }
            table = this.knowledge.uris[1];
            this.knowledge.uris[1] = { "uri": "http://www.w3.org/XML/1998/namespace", "names": [{ "name": "base"}, { "name": "id"}, { "name": "lang"}, { "name": "space"}] };
            if (table != null && table.names != null && table.names[0] != this.knowledge.uris[1].names[0]) {
                this.knowledge.uris[1].names = this.knowledge.uris[1].concat(table.names);
            }
            table = this.knowledge.uris[2];
            this.knowledge.uris[2] = { "uri": "http://www.w3.org/2001/XMLSchema-instance", "names": [{ "name": "nil", "attributeID": 0 }, { "name": "type", "attributeID": 1}] };
            if (table != null && table.names != null && table.names[0] != this.knowledge.uris[2].names[0]) {
                this.knowledge.uris[2].names = this.knowledge.uris[2].names.concat(table.names);
            }
            if (this.knowledge.uris.length > 3) {
                table = this.knowledge.uris[3];
                // only for schema-informed streams
                this.knowledge.uris[3] = { "uri": "http://www.w3.org/2001/XMLSchema", "names": [{ "name": "ENTITIES", "grammarID": 1 }, { "name": "ENTITY", "grammarID": 1 },
                                                                            { "name": "ID", "grammarID": 1 }, { "name": "IDREF", "grammarID": 1 }, { "name": "IDREFS", "grammarID": 1 }, { "name": "NCName", "grammarID": 1 }, { "name": "NMTOKEN", "grammarID": 1 },
                                                                            { "name": "NMTOKENS", "grammarID": 1 }, { "name": "NOTATION", "grammarID": 1 }, { "name": "Name", "grammarID": 1 }, { "name": "QName", "grammarID": 1 }, { "name": "anySimpleType", "grammarID": 1 },
                                                                            { "name": "anyType", "grammarID": 1 }, { "name": "anyURI", "grammarID": 1 }, { "name": "base64Binary", "grammarID": 2 }, { "name": "boolean", "grammarID": 3 }, { "name": "byte", "grammarID": 4 },
                                                                            { "name": "date", "grammarID": 5 }, { "name": "dateTime", "grammarID": 6 }, { "name": "decimal", "grammarID": 7 }, { "name": "double", "grammarID": 8 }, { "name": "duration", "grammarID": 9 },
                                                                            { "name": "float", "grammarID": 10 }, { "name": "gDay", "grammarID": 11 }, { "name": "gMonth", "grammarID": 12 }, { "name": "gMonthDay", "grammarID": 13 }, { "name": "gYear", "grammarID": 14 },
                                                                            { "name": "gYearMonth", "grammarID": 15 }, { "name": "hexBinary", "grammarID": 16 }, { "name": "int", "grammarID": 17 }, { "name": "integer", "grammarID": 18 }, { "name": "language", "grammarID": 1 },
                                                                            { "name": "long", "grammarID": 19 }, { "name": "negativeInteger", "grammarID": 20 }, { "name": "nonNegativeInteger", "grammarID": 21 }, { "name": "nonPositiveInteger", "grammarID": 22 }, { "name": "normalizedString", "grammarID": 1 },
                                                                            { "name": "positiveInteger", "grammarID": 23 }, { "name": "short", "grammarID": 24 }, { "name": "string", "grammarID": 1 }, { "name": "time", "grammarID": 25 }, { "name": "token", "grammarID": 1 },
                                                                            { "name": "unsignedByte", "grammarID": 26 }, { "name": "unsignedInt", "grammarID": 27 }, { "name": "unsignedLong", "grammarID": 28 }, { "name": "unsignedShort", "grammarID": 29 }
                                                                            ]
                };
                if (table != null && table.names != null && table.names[0] != this.knowledge.uris[3].names[0]) {
                    this.knowledge.uris[3].names = this.knowledge.uris[3].names.concat(table.names);
                }
            }
            // initialize the local value tables 
            var lvtID = 0;
            for (var i = 0; i < this.knowledge.uris.length; i++) {
                if (this.knowledge.uris[i].names != null && this.knowledge.uris[i].names != null) {
                    for (var j = 0; j < this.knowledge.uris[i].names.length; j++) {
                        var name = this.knowledge.uris[i].names[j];
                        name.lvtID = lvtID;
                        if (this.knowledge.uris[i].names[j].elementID != null && this.knowledge.uris[i].names[j].elementID >= 0) {
                            this.knowledge.elements[name.elementID].lvtID = lvtID;
                            this.knowledge.elements[name.elementID].grammar.lvtID = lvtID;
                        }
                        if (this.knowledge.attributes.length>0 && this.knowledge.uris[i].names[j].attributeID != null && this.knowledge.uris[i].names[j].attributeID >= 0) {
                            this.knowledge.attributes[name.attributeID].lvtID = lvtID;
                        }
                        lvtID++;
                    }
                }
            }
            // Initialize the local value tables for local elements
            for (var i = this.knowledge.predefinedElementNumber; i < this.knowledge.elements.length; i++) {
                var elt = this.knowledge.elements[i];
                elt.lvtID = this.getNameLvtID(elt.uri, elt.name);
            }
        }
    }
    this.initKnowledge(knowledge);

	// Bit packed size of second level or third level grammars.
    this.schemalessSELevel1 = 2;
    this.schemalessCTLevel1 = 1;
    this.schemaFirstSELevel1 = 3;
    this.schemaSELevel1NoEE = 2;
    this.schemaSELevel1 = 3;
    this.schemaCTLevel1NoEE = 1;
    this.schemaCTLevel1 = 2;
	// FIXME: Put this as an option object.
    this.isDTD = false;
    this.isComment = false;
    this.isPI = false;
    this.isLexicalValues = false;
    this.isPrefix = false;
    this.setFidelityOptions = function(isDTD, isComment, isPI/*, isLexicalValues, isPrefix*/) {
        this.isDTD = isDTD;
        this.isComment = isComment;
        this.isPI = isPI;
		//this.isLexicalValues = isLexicalValues;
		//this.isPrefix = isPrefix;
        if(isDTD || isComment || isPI) {
            this.schemalessSELevel1 = 3;
            this.schemalessCTLevel1 = 2;
            this.schemaSELevel1NoEE = 3;
        }
    }

    this.isStrict = false;
    this.setStrictMode = function() {
        this.isStrict = true;
    }
    this.setDefaultMode = function() {
        this.isStrict = false;
    }

    // precompression mode
    this.channels = [];
    this.orderedChannels = [];
    this.valueCounter = 0;
    this.localValuesCounter = 0;

    this.getErrorId = function() {
        return this.errorId;
    }

    this.getErrorMsg = function() {
        return this.errorMsg;
    }

    this.readStreamByte = function() {
        if (this.bytes.length > this.index) {
            return this.bytes[this.index++];
        }
        else {
            alert("eos");
            return -1;
        }
    }
    this.readByte = this.readStreamByte;

    this.readByteAlignedIndex = function(nbit) {
        if (nbit < 0) {
            this.setError(-10, "-1");
            return -1;
        }
        if (nbit == 0) return 0;
        else if (nbit < 8) {
            return this.readByte();
        }
        else {
            var res = 256 * this.readByte();
            return res + this.readByteAlignedIndex(nbit - 8);
        }
    }

    this.readBitPackedByte = function() {
        var value;
        if (this.availableBits == 0) {
            return this.readByte();
        }
        if (this.availableBits == 8) {
            value = this.current;
            this.current = this.readByte();
            return value;
        }
        value = this.current;
        this.current = this.readByte();
        value += this.current >> this.availableBits;
        this.current = (this.current << (8 - this.availableBits)) & 0xff;
        return value;
    }

    this.readBitPackedNBitInteger = function(numBits) {
        if (numBits == 0) {
            return 0;
        }
        else if (numBits == 8) {
            this.readBitPackedByte();
        }
        else {
            var value = 0;
            while (numBits-- > 0) {
                if (this.availableBits == 0) {
                    this.availableBits = 8;
                    this.current = this.readByte();
                }
                value = 2 * value;
                if ((this.current & 0x80) != 0) value++;
                this.current = (this.current << 1) & 0xff;
                this.availableBits--;
            }
            return value;
        }
    }

    this.computeNBitSize = function(max) {
        if (max < 0) {
            // TODO: set error msg
            this.setError(-1, "1");
            return 0;
        }
        var numBits = 0;

        while (max != 0) {
            numBits++;
            max = max >> 1;
        }
        return numBits;
    }

    this.readByteAlignedInteger = function() {
        var intVal = 0;
        var mul = 1;
        var val = this.readByte();
        while (val >= 128) {
            intVal = intVal + mul * (val - 128);
            val = this.readByte();
            mul = mul * 128;
        }
        intVal = intVal + mul * val;
        return intVal;
    }

    this.readBitPackedInteger = function() {
        var intVal = 0;
        var mul = 1;
        var val = this.readBitPackedByte();
        while (val >= 128) {
            intVal = intVal + mul * (val - 128);
            val = this.readBitPackedByte();
            mul = mul * 128;
        }
        intVal = intVal + (mul * val);
        return intVal;
    }

    this.readSignedInteger = function() {
        var sign = this.readIndex(1);
        var val = this.readInteger();
        return (sign == 0) ? val : -val;
    }

    this.setByteAligned = function() {
        this.readIndex = this.readByteAlignedIndex;
        this.readInteger = this.readByteAlignedInteger;
        this.processValue = this.decodeValue;
        this.decodeValues = this.doNothing;
    }

    this.setBitPacked = function() {
        this.readIndex = this.readBitPackedNBitInteger;
        this.readInteger = this.readBitPackedInteger;
        this.processValue = this.decodeValue;
        this.decodeValues = this.doNothing;
    }

    this.setPrecompression = function() {
        this.readIndex = this.readByteAlignedIndex;
        this.readInteger = this.readByteAlignedInteger;
        this.processValue = this.storeChannelValue;
        this.decodeValues = this.decodeChannelValues;
    }

    this.decode = function() {
        // process the first SE
        var numbit = this.computeNBitSize(this.knowledge.predefinedElementNumber + ((this.isComment || this.isDTD || this.isPI) ? 1 : 0));
        var index = this.readIndex(numbit);
        var content;
        var element;
        var node = this.createElement(null,"root");
        // DocContent grammar
        while (index > this.knowledge.predefinedElementNumber) {
            var isDTD;
            if (this.isDTD && (this.isComment || this.isPI)) {
                isDTD = this.readIndex(1) == 0;
            }
            else {
                isDTD = this.isDTD;
            }
            if (isDTD) {
                var s_name = this.decodeLitteralString();
                var s_public = this.decodeLitteralString();
                var s_system = this.decodeLitteralString();
                var s_text = this.decodeLitteralString();
                this.appendDTD(node, s_name, s_public, s_system, s_text);
            }
            else {
                this.processCMPI(node);
            }
            index = this.readIndex(numbit);
        }
        if (index < 0) {//TODO: set error msg
            this.setError(-1, "1");
            return -1;
        }
        if (index < this.knowledge.predefinedElementNumber) {
            element = this.knowledge.elements[index];
            // Schema-informed SE
            content = this.processEvent(this.knowledge.elements[index]);
        }
        else if (index == this.knowledge.predefinedElementNumber) {
            // SE(*)
            var element = this.decodeElementName();
            content = this.processEvent(this.knowledge.elements[element.elementID]);
        }

        this.appendElement(node, content, element);

        // DocEnd grammar
        numbit = (this.isComment || this.isPI) ? 1 : 0;
        index = this.readIndex(numbit);
        while (index > 0) {
            // CM or PI
            this.processCMPI(node);
            index = this.readIndex(numbit);
        }

        // build node and parse values
        this.decodeValues(node);
        return node;
    }

    this.decodeStructure = function() {
        return this.processEvent(this.knowledge.root);
    }


    this.generateXMLDocument = function(node) {
        var xml = ""; //"<?xml version=\"1.0\"?>\n";
        xml += this.generateXMLElement(node, null, {});
        return xml;
    }

    this.generateQName = function(name, namespaces, isSE) {
        var index = name.indexOf('#');
        if (index == -1) {
            return name;
        }
        else if (index == 0) {
            return name.substring(index + 1, name.length);
        }
        else {
            var qname = "";
            var uri = name.substring(0, index);
            var prefix = namespaces[uri];
            if (prefix == null) {
                if (namespaces["@length"] == null) {
                    namespaces["@length"] = 0;
                }
                prefix = "ns" + namespaces["@length"];
                namespaces["@length"] = namespaces["@length"] + 1;
                if (isSE) {
                    namespaces[uri] = prefix;
                    return prefix + ":" + name.substring(index + 1, name.length) + " xmlns:" + prefix + "=\"" + uri + "\"";
                }

            }
            return prefix + ":" + name.substring(index + 1, name.length);
        }
    }

    this.getChildItem = function(keys, i, key, child) {
        if (child instanceof Array) {
            var cptr = 0;
            for (var j = 0; j < i; j++) {
                if (keys[j] == key) {
                    cptr++;
                }
            }
            return child[cptr];
        }
        return child;
    }
    
    this.genXMLElement = function(node, n, ns,array) {
        if (node instanceof Array) {// array, go through the items
            for (var i = 0; i < node.length; i++) {
                this.genXMLElement(node[i], n, ns, true,array);
            }
        }
        else if (node instanceof Object) {// object, go through the children
            var addWrapper = n != null;
            var namespaces = this.copyObject(ns);
            var keys = node["+keys"];
            if (addWrapper) {
                array.push("<");
                array.push(this.generateQName(n, namespaces, true));
            }
            for (var i = 0; i < keys.length; i++) {
                var key = keys[i];
                var child = node[key];
                if (key[0] == '@') {
                    array.push(" ");
                    array.push(this.generateQName(key.substring(1, key.length), namespaces));
                    array.push("\"" + child + "\"");
                }
            }
            var hasContent = false;
            for (var i = 0; i < keys.length; i++) {
                var key = keys[i];
                var child = this.getChildItem(keys,i,key,node[key]);
                if (key == '+ch') {
                    if (!hasContent) {
                        if (addWrapper) array.push(">\n");
                        hasContent = true;
                    }
                    array.push(child);
                }
                else if (key == '+cm') {
                    if (!hasContent) {
                        if (addWrapper) array.push(">\n");
                        hasContent = true;
                    }
                    array.push("<!--" + child + "-->");
                }
                else if (key == '+pi') {
                    //TODO
                    if (!hasContent) {
                        if (addWrapper) array.push(">\n");
                        hasContent = true;
                    }
                    array.push("<?" + child.name + " " + child.target + "?>\n");
                }
                else if (key == '+dtd') {
                }
                else if (key[0] != '@') {
                    if (!hasContent) {
                        if (addWrapper) array.push(">\n");
                        hasContent = true;
                    }
					if(child instanceof String || typeof child == 'string' || 
							typeof child =='boolean' || typeof child=='number') {
						array.push("<"+key+">"+child+"</"+key+">\n");
					}
					else {
						this.genXMLElement(child, key, namespaces,array);
					}
                }
            }
            if (addWrapper) {
                if (hasContent) {
                    array.push("</" + this.generateQName(n, namespaces, false) + ">\n");
                }
                else {
                    array.push("/>\n");
                }
            }
        }
        else {
            array.push("<" + this.generateQName(n, ns, true) + "/>\n");
        }
    }
    this.generateXMLElement = function(node, n, ns) {
		array= [];
		this.genXMLElement(node,n,ns,array);
		return array.join("");
	}
    

    this.decodeChannelValues = function(node) {
        var channels = this.organizeChannels();
        for (var i = 0; i < channels.length; i++) {
            var channel = channels[i];
            this.populateChannel(node, { "currentCount": 0, "counter": channel.nodes[0].counter, "channel": channel, "index":0 });
        }
    }

    this.checkChannelValue = function(node, key, state) {
        if (key == "+keys" || key == "+cm" || key == "+pi" || key == "+er") {
            return false;
        }
        var item = node[key];
        if ((item instanceof Array) || (typeof item) == "object") {
            if (this.populateChannel(item, state)) {
                return true;
            }
        }
        else if (state.currentCount == state.counter) {
            var value = this.decodeValue(state.channel.nodes[state.index].grammar, state.channel.lvtID);
            node[key] = value;
            state.index++;
            if (state.index >= state.channel.nodes.length) {
                return true;
            }
            else {
                state.counter = state.channel.nodes[state.index].counter;
            }
            state.currentCount++;
        }
        else {
            state.currentCount++;
        }
    }

    this.populateChannel = function(node, state) {
        if (node instanceof Array) {// array, go through the items
            for (var i = 0; i < node.length; i++) {
                if (this.checkChannelValue(node, i, state)) {
                    return true;
                }
            }
        }
        else {// object, go through the children
            for (var name in node) {
                if (this.checkChannelValue(node, name, state)) {
                    return true;
                }
            }
        }
        return false;
    }

    this.doNothing = function(node) {
    }

    this.processStreamEvent = function(elementDescription) {
        var grammar = elementDescription.grammar;

        var node = null;
        if (grammar.type) {
            if (!this.isStrict || grammar.xsiTypeNil > 0) {
                index = this.readIndex(1);
                if (index != 0) {
                    // handle extension event
                    return this.decodeSimpleTypedElement(elementDescription, false, this.createElement(elementDescription.uri, elementDescription.name));
                }
            }
            node = this.processValue(grammar, elementDescription.lvtID);
            if (!this.isStrict) {
                index = this.readIndex(1);
                if (index != 0) {
                    // handle extension event
                    var elt = this.createElement(elementDescription.uri, elementDescription.name);
                    this.appendCH(elt, node);
                    node = elt;
                    return this.decodeSimpleTypedElement(elementDescription, true, node);
                }
            }
        }
        else if (grammar.builtin) {
            // learning grammar
            node = this.decodeSchemalessElement(elementDescription);
        }
        else {
            // schema-informed grammar
            node = this.decodeSchemaInformedElement(elementDescription);
        }
        return node;
    }
    this.processEvent = this.processStreamEvent;

    this.storeChannelValue = function(grammar,lvtID) {
        // simple type
        var channel = this.channels[lvtID];
        if (channel == null) {
            channel = { "name": name, "nodes": [], "lvtID":lvtID };
            this.channels[lvtID] = channel;
            this.orderedChannels.push(channel);
        }
        var nodes = channel.nodes;
        var channelEntry = { "grammar": grammar, "counter": this.valueCounter };
        nodes.push(channelEntry);
        this.valueCounter++;
        return this.valueCounter;
    }

    this.decodeValue = function(grammar, lvtID) {
        var length;
        var type = grammar.type;
        var node = null;
        if (type == "exi:string" || type == "exi:union" || type == "exi:string_restricted") {
            // support for litteral strings only for the moment
            length = this.readInteger();
            if (length == 0) {
                // local value index
                var localValues = this.localValues[lvtID];
                node = localValues.values[this.readIndex(localValues.indexSize)];
            }
            else if (length == 1) {
                // global value index
                node = this.globalValues.values[this.readIndex(this.globalValues.indexSize)];
            }
            else {
                node = "";
                if (grammar.typeInfo) {
                    //restricted character set
                    while (--length >= 2) {
                        var size;
                        if (grammar.nbit == null) {
                            size = grammar.nbit = this.computeNBitSize(grammar.typeInfo.length);
                        }
                        else {
                            size = grammar.nbit;
                        }
                        var c = this.readIndex(size);
                        node = node + grammar.typeInfo.charAt(c);
                    }
                }
                else {
                    while (--length >= 2) {
                        var ch = this.readInteger();
                        node = node + String.fromCharCode(ch);
                    }
                }
                this.globalValues.values.push(node);
                if (this.globalValues.values.length > Math.pow(2, this.globalValues.indexSize)) {
                    this.globalValues.indexSize++;
                }
                var localValues = this.localValues[lvtID];
                if (localValues == null) {
                    this.localValues[lvtID] = localValues = { "indexSize": 0, "values": [] }; ;
                }
                localValues.values.push(node);
                if (localValues.values.length > Math.pow(2, localValues.indexSize)) {
                    localValues.indexSize++;
                }
            }
        }
        else if (type == "exi:decimal") {
            var integral = this.readSignedInteger();
            var fractional = ("" + this.readInteger()).split("").reverse().join("");
            node = parseFloat(integral + "." + fractional);
        }
        else if (type == "exi:integer") {
            node = this.readSignedInteger();
        }
        else if (type == "exi:integer_unsigned") {
            node = this.readInteger();
        }
        else if (type == "exi:integer_bounded") {
            node = this.readIndex(grammar.typeInfo.numbit) + grammar.typeInfo.min;
        }
        else if (type == "exi:boolean") {
            node = this.readIndex(1) == 1;
        }
        else if (type == "exi:boolean_pattern") {
            node = (this.readIndex(2) > 1) == 1;
        }
        else if (type == "exi:float" || type == "exi:double") {
            var mantissa = this.readSignedInteger();
            var exponent = this.readSignedInteger();
            node = parseFloat(mantissa + "e" + exponent);
        }
        else if (type == "exi:base64Binary" || type == "exi:hexBinary") {
            length = this.readInteger();
            node = new Uint8Array(length);
            for (var i = 0; i < length; i++) {
                node[i] = this.readIndex(8);
            }
        }
        else if (type == "exi:list") {
            length = this.readInteger();
            node = [];
            for (var idx = 0; idx < length; idx++) {
                node.push(this.decodeValue(grammar.items));
            }
        }
        else if (type == "exi:enumeration") {
            var enums = this.knowledge.simpleTypes[grammar.typeInfo.index];
            var index = this.readIndex(enums.bitnum);
            return enums.values[index];

        }
        else if (type == "exi:date") {
            var year = this.readSignedInteger() + 2000;
            var monthDay = this.readIndex(9);
            var month = monthDay >> 5;
            var day = monthDay % 32;
            node = new Date(year, month, day);
            var presence = this.readIndex(1);
            if (presence == 1) {
                var tmz = this.readIndex(11);
            }
            //var time = this.readIndex(17);
            //var millisecs = this.readIndex(1) == 0 ?
            //	"0" : ("" + this.readInteger()).split("").reverse().join("");
            //if (millisecs.length > 3) millisecs = millisecs.substring(0, 3);
            //node = new Date(year, month >> 5, day % 32, time >> 12, (time >> 6) % 64, time % 64, parseInt(milliseconds));
            //var timezone = this.readIndex(1) == 0 ?
            //	"" : this.readIndex(11);
        }
        else if (type == "empty") {
            // xsi:nil = true
            node = null;
        }
        else if (type == "litteralString") {
            return this.decodeLitteralString();
        }
        else if (type == "exi:qname") {
            return this.decodeName();
        }
        else if (this.knowledge.simpleTypes[type]) {
            // additional specific codecs
            this.setError(-1, "0");
            node = null;
        }
        return node;
    }

    this.decodeLitteralString = function() {
        return this.decodeLitteralStringWithLength(this.readInteger());
    }
    
    this.decodeLitteralStringWithLength = function(length) {
        var val = "";
        while (--length >= 0) {
            var c = this.readInteger();
            if (c != -1) {
                val = val + String.fromCharCode(c);
            }
            else {
                return null;
            }
        }
        return val;
    }
    
    this.organizeChannels = function() {
        var smallChannels = [];
        var bigChannels = [];
        for (var i in this.orderedChannels) {
            var channel = this.orderedChannels[i];
            if (channel.length < 100) {
                smallChannels.push(channel);
            }
            else {
                bigChannels.push(channel);
            }
        }
        return smallChannels.concat(bigChannels);
    }


    this.createElementDescription = function(qname) {
        var qnameDesc = {
            "uri": qname.uri,
            "name": qname.name,
            "lvtID": qname.lvtID,
            "grammar": {
                "builtin": true,
                "start": [0],
                "startNBit": 0,
                "content": [-1, 0],
                "contentNBit": 1,
                "attributes":[]
            }
        };
        qname.elementID = this.knowledge.elements.length;
        this.knowledge.elements.push(qnameDesc);
    }

    this.decodeElementNameWithURI = function(index) {
        var qname = this.decodeNameWithURI(index);
        if (!(qname.elementID > 0)) {
            this.createElementDescription(qname);
        }
        return qname;
    }

    this.decodeElementName = function() {
        var qname = this.decodeName();
        if (!(qname.elementID >= 0)) {
            this.createElementDescription(qname);
        }
        return qname;
    }

    this.decodeNameWithURI = function(uriIndex) {
        var uri = this.knowledge.uris[uriIndex].uri;
        var names = this.knowledge.uris[uriIndex].names;
        var nameIndex = this.readInteger();
        if (nameIndex == 0) {
            nameIndex = this.readIndex(this.computeNBitSize(names.length - 1));
            qname = names[nameIndex];
        }
        else {
            var name = this.decodeLitteralStringWithLength(nameIndex - 1);
            qname = { "name": name, "lvtID": this.localValuesCounter++};
            if(uri!=null && uri!="") {
                qname.uri = uri;
            }
            names.push(qname);
        }
        return qname;
    }

    this.decodeName = function() {
        var uri = "";
        var names = null;
        var qname = null;
        var qnameDesc = null;
        var uriIndex = this.readIndex(this.computeNBitSize(this.knowledge.uris.length));
        if (uriIndex == 0) {
            // we have a new URI to decode
            uri = this.decodeLitteralStringWithLength(this.readInteger());
            names = [];
            this.knowledge.uris.push({ "uri": uri, "names": names });
            uriIndex = this.knowledge.uris.length;
        }
        return this.decodeNameWithURI(uriIndex-1);
    }


    this.insertStartProduction = function(grammar, production) {
        grammar.start.unshift(production);
        if (Math.pow(2, grammar.startNBit) < grammar.start.length) {
            grammar.startNBit++;
        }
    }

    this.insertContentProduction = function(grammar, production) {
        grammar.content.unshift(production);
        if (Math.pow(2, grammar.contentNBit) < grammar.content.length) {
            grammar.contentNBit++;
        }
    }

    this.checkExistingProduction = function(grammar, type) {
        for (var i = 0; i < grammar.length; i++) {
            if (grammar[i].type == type) {
                return true;
            }
        }
        return false;
    }

    this.processStartEventExtension = function(node, grammar) {
        //0=EE, 1=AT, 2=SE, 3=CH, 4=ER, 5=CM/PI
        var index = this.readIndex(this.schemalessSELevel1);
        if (index < 0) {
            //TODO: set error msg            this.setError(-1, "1");
            this.setError(-1, "1");
            return null;
        }
        switch (index) {
            case 0: //EE
                if (!this.checkExistingProduction(grammar.start, -1)) {
                    this.insertStartProduction(grammar, -1);
                }
                return -1;
            case 1: //AT
                var attribute = this.decodeName();
                if (attribute.name == "xsi:type") {
                    this.insertStartProduction(grammar, 1);
                    return 1;
                }
                else {
                    grammar.attributes.push({ "type": "at", "name": attribute.name, "lvtID": attribute.lvtID, "value": attribute.type });
                    this.insertStartProduction(grammar, 1 + grammar.attributes.length);
                    return 1 + grammar.attributes.length;
                }
            case 2: // SE
                production = { "type": "se" };
                var element = this.decodeElementName();
                production.element = this.knowledge.elements[element.elementID];
                this.insertStartProduction(grammar, -3 - element.elementID);
                return -3 - element.elementID;
            case 3: // CH
                if (!this.checkExistingProduction(grammar.start, -2)) {
                    this.insertStartProduction(grammar, -2);
                }
                return -2;
            case 4: // ER
                if (this.isDTD) {
                    var child = "&" + this.decodeLitteralString() +";";
                    this.appendCH(node, child);
                    return 0;
                }
            case 5: // CMPI
                this.processCMPI(node);
                return 0;
            default:
                //TODO: set error msg            this.setError(-1, "1");
                this.setError(-1, "1");
                return null;
        }
        return node;
    }
    
    this.processContentExtension = function(node, grammar) {
        var index = this.readIndex(this.schemalessCTLevel1);
        if (index < 0) {
            //TODO: set error msg            this.setError(-1, "1");
            this.setError(-1, "1");
            return null;
        }
        switch (index) {
            case 0://SE
                var element = this.decodeElementName();
                production.element = this.knowledge.elements[element.elementID];
                this.insertContentProduction(grammar, element.elementID+2);
                return element.elementID+2;
            case 1://CH
                if (!this.checkExistingProduction(grammar.start,1)) {
                    this.insertContentProduction(grammar, 1);
                }
                var child = this.processValue({ "type": "exi:string"}, elementDescription.lvtID);
                this.appendCH(node, child);
                return 1;
            case 2: //ER
                if (this.isDTD) {
                    var child = "&" + this.decodeLitteralString() +";";
                    this.appendCH(node, child);
                    break;
                }
            case 3://CMPI
                this.processCMPI(state.node);
                return 0;
            default:
                //TODO: set error msg            this.setError(-1, "1");
                return null;
        }
        return node;
    }

	
	// Only xml-like JSON object decoding is tested right now
	// DOM object decoding could be done instead
	// Should probably add more standard JSON mapping and remove DOM one
    this.isJson = true;
    this.appendAttribute = function(node, attribute, value) {
        if (this.isJson) {
            this.appendChild(node,value,"@" + attribute.name);
        }
        else {
            if (attribute.uri == null) {
                node.setAttribute(attribute.name, value);
            }
            else {
                node.setAttributeNS(attribute.uri, attribute.name, value);
            }
        }
    }

    this.appendCH = function(node, value) {
        if (this.isJson) {
            this.appendChild(node, value, "+ch");
        }
        else {
            node.appendChild(document.createTextNode(value));
        }
    }

    this.appendPI = function(node, name, text) {
        if (this.isJson) {
            this.appendChild(node, { "name": name, "target": text }, "+pi");
        }
        else {
            //var pi = document.createProcessingInstruction(name, text);
            var pi = document.createComment("this is a pi! "+ name + " "+ text);
            node.appendChild(pi);
        }
    }

    this.appendComment = function(node, value) {
        if (this.isJson) {
            this.appendChild(node, value, "+cm");
        }
        else {
            node.appendChild(document.createComment(value));
        }    
    }

    this.appendDTD = function(node, name, _public, system, text) {
        if(this.isJson) {
            this.appendChild(node, { "name": name, "public": _public, "system": system, "text": text }, "+dtd");
        }
        else {
            //TODO
        }    
    }

    this.getText = function(node) {
        if(this.isJson) {
            return node["+ch"];
        }
        else {
            return node.firstChild.nodeValue;
        }    
    }

    this.createElement = function(uri,name) {
        if(this.isJson) {
            return {};
        }
        else {
            return (uri != null) ? document.createElementNS(uri, name) : document.createElement(name);
        }
    }

    this.appendElement = function(node, child, element) {
        if (this.isJson) {
            this.appendChild(node, child,
                    (element.uri == null || element.uri.length == 0) ? element.name : element.uri + "#" + element.name);
        }
        else {
            if (child == null) {
                child = this.createElement(element.uri, element.name);
            }
            node.appendChild(child);
        }
    }

    this.appendChild = function(node, child, name) {
        if (node == null) {
            node = null;
        }
        var keys = node["+keys"];
        if (keys == null) {
            keys = [];
            node["+keys"] = keys;
        }
        keys.push(name);
        if (node.hasOwnProperty(name)) {
            var existingChild = node[name];
            if (existingChild instanceof Array) {
                existingChild.push(child);
            }
            else {
                var myarray = [];
                myarray.push(existingChild);
                myarray.push(child);
                node[name] = myarray;
            }
        }
        else {
            node[name] = child;
        }
    }

    this.decodeSchemalessElement = function(elementDescription) {
        var grammar = elementDescription.grammar;
        var node = this.createElement(elementDescription.uri,elementDescription.name);
        var isEmpty = true;
        var isText = false;
        var production;
        do {
            var index = this.readIndex(grammar.startNBit);
            if (index == -1 || index >= grammar.start.length) {
                return null;
            }
            production = grammar.start[index];
            if (production == 0) {
                production = this.processStartEventExtension(node, grammar);
            }
            if (production == 1) {//xsi:type
                var type = this.decodeName();
                this.appendAttribute(node, { "name": "xsi:type" }, type.name);
                if (type.grammarID >= 0) {
                    // do grammar switch
                    elementDescription = this.buildGrammarFromType(elementDescription, type);
                    this.decodeNextSchemaInformedProduction(state, true);
                    var state = { "next": 0, "choice": 0, "index": 0, "node": node, "elementDescription": elementDescription };
                    return this.decodeSchemaInformedSE(state);
                }
            }
            else if (production > 1) {// AT
                var attribute = grammar.attributes[production - 2];
                this.appendAttribute(node, attribute, this.processValue({ "type": "exi:string" }, attribute.lvtID));
            }
            else if (production == -1) {// EE
                return isEmpty ? null : (isText ? this.getText(node) : node);
            }
            else if (production == -2) {//CH
                var child = this.processValue({ "type": "exi:string" }, elementDescription.lvtID);
                this.appendCH(node, child);
                isText = isEmpty ? true : false;
            }
            else if (production < -2) {// SE
                var element = this.knowledge.elements[-production - 3];
                var child = this.processEvent(element);
                this.appendElement(node, child, element);
            }
            isEmpty = false;
        } while (production > 0);
        // now switching to content grammar
        while (production != -1) {
            var index = this.readIndex(grammar.contentNBit);
            if (index == -1 || index >= grammar.content.length) {
                //TODO: set error msg
                this.setError(-1, "1");
                return null;
            }
            production = grammar.content[index];
            if (production == 0) {//extension
                production = this.processContentExtension(node, grammar);
            }
            if (production > 1) {//SE
                var element = this.knowledge.elements[production - 2];
                var child = this.processEvent(element);
                this.appendElement(node, child, element);
            }
            else if (production == 1) {//CH
                var child = this.processValue({ "type": "exi:string" }, elementDescription.lvtID);
                this.appendCH(node, child);
            }
        }
        return node;
    }

    // default mode is byte aligned
    this.setByteAligned();

    this.checkEE = function(grammar, state, isContent) {
        var i = state.next;
        var startContent = state.next;
        var endContent = state.next + state.choice;
        if (!isContent) {
            if (grammar.start != null) {
                if (grammar.start.length < endContent) {
                    startContent = 0;
                    endContent -= grammar.start.length;
                }
            }
        }
        for (i = startContent; i <= endContent; i++) {
            if (grammar.content.children[i] == -1) {
                return true;
            }
        }
        return false;
    }

    this.copyObject = function(oldObject) {
		// FIXME: optimize this!
		return JSON.parse(JSON.stringify(oldObject));
    }
    this.buildGrammarFromType = function(elementDescription, type) {
        var newDescription = copyObject(elementDescription);
        if (type.grammarID < 30) {
            // schema built-in types (simple types or ur-type)
            if (type.grammarID == 0) {
                newDescription.grammar = { "start": { "children": ["at"], "choices": [2], "next": [0] }, "content": { "children": ["se", "ee", "ch"], "choices": [2, 2, 2], "next": [0, 3, 0]} }
            }
            else {
                delete newDescription.grammar;
                newDescription.type = type.name;
            }
        }
        else {
            newDescription.grammar = this.knowledge.types[type.grammarID - 30];
        }
        return newDescription;
    }

    this.buildGrammarFromNil = function(elementDescription) {
        var newDescription = copyObject(elementDescription);
        if (elementDescription.empty) {
            newDescription.grammar = emptyGrammar;
        }
        else if (newDescription.type != null) {
            // empty simple type grammar
            var emptyGrammar = this.copyObject(elementDescription.grammar);
            emptyGrammar.type = "empty";
            newDescription.grammar = emptyGrammar;
            elementDescription.emptyGrammar = emptyGrammar;
        }
        else {
            // empty complex type grammar
            var emptyGrammar = this.copyObject(elementDescription.grammar);
            emptyGrammar.content = { "children": [-1], "choices": [0], "next": [1] };
            if (emptyGrammar.start != null) {
                // update start.choices
                emptyGrammar.start.choices = [];
                var length = emptyGrammar.start.choices.length;
                for (var i = 0; i < length; i++) {
                    var choice = elementDescription.grammar.start.choices[i];
                    if (i + choice > length) {
                        choice = length - i;
                    }
                    emptyGrammar.start.choices[i] = choice;
                }
                emptyGrammar.initialChoice = emptyGrammar.start.choices[0];
            }
            else {
                emptyGrammar.initialChoice = 0;
            }
            newDescription.grammar = emptyGrammar;
            elementDescription.empty = emptyGrammar
        }
        return newDescription;
    }

    this.handleNil = function(state) {
        if (this.readIndex(1) == 1) {
            this.appendAttribute(state.node, { "name": "xsi:nil" }, true);
            state.elementDescription = this.buildGrammarFromNil(elementDescription);
            state.index = 0;
            state.next = 0;
        }
        else {
            this.appendAttribute(state.node, { "name": "xsi:nil" }, false);
        }
    }

    this.handleType = function(state) {
        var type = this.decodeName();
        this.appendAttribute(state.node, { "name": "xsi:type" }, type.name);
        if (type.grammarID >= 0) {
            // do grammar switch
            state.elementDescription = this.buildGrammarFromType(state.elementDescription, type);
            state.index = 0;
            state.next = 0;
        }
    }

    this.decodeNextSchemaInformedProduction = function(state, isStart) {
        if (isStart) {
            var grammar = state.elementDescription.grammar;
            if (grammar.start != null && grammar.start.choices.length>state.next) {
                state.choice = grammar.start.choices[state.next];
            }
            else {
                state.choice = 0;
            }
        }
        else {
            state.choice = state.elementDescription.grammar.content.choices[state.next];
        }
        state.index = this.readIndex(this.computeNBitSize(state.choice + (this.isStrict ? 0 : 1)));
    }

    this.decodeSEExtensionProduction = function(state, index) {
        switch (index) {
            case 0: //xsi:type
                this.handleType(state);
                return 0;
            case 1: //xsi:nil
                this.handleNil(state);
                return 0;
            case 2: //AT(*)
                var attribute = this.decodeName();
                if (attribute.attributeID > 0) {
                    // global attribute
                    attribute = this.knowledge.attributes[attribute.attributeID];
                    this.appendAttribute(state.node, attribute,  this.processValue({ "type": attribute.type}, attribute.lvtID));
                }
                else {
                    this.appendAttribute(state.node, attribute,  this.processValue({ "type": "exi:string"}, attribute.lvtID));
                }
                return 0;
            case 3: //Invalid AT
                var numAttr = 0;
                while (state.elementDescription.grammar.start.children[state.next + numAttr] >= 0) numAttr++;
                var index = this.readIndex(this.computeNBitSize(numAttr));
                if (index <= numAttr) {
                    var attrIndex = state.elementDescription.grammar.start.children[state.next + index];
                    var attribute = this.knowledge.attributes[attrIndex];
                    this.appendAttribute(state.node, attribute,  this.processValue({ "type": "exi:string"}, attribute.lvtID));
                }
                else {
                    //Invalid AT(*)
                    var attribute = this.decodeName();
                    this.appendAttribute(state.node, attribute, this.processValue({ "type": "exi:string" }, attribute.lvtID));
                }
                return 0;
            default:
                state.next = 0;
                this.decodeContentExtensionProduction(state, index - 4);
                return 1; 
        }
        return node;
    }

    this.decodeFirstSchemaInformedSEExtension = function(state) {
        var grammar = state.elementDescription.grammar;
        var index;
        if (isStrict) {
            var typeOrNil = grammar.xsiTypeNil;
            switch (typeOrNil) {
                case 1: //xsi:nil
                    index = 1;
                    break;
                case 2: //xsi:type
                    index = 0;
                    break;
                case 3: //xsi:type or xsi:nil
                    index = this.readIndex(1);
                    break;
                default:
                    //TODO: set error msg
                    this.setError(-1, "1");
                    return -1;
            }
        }
        else {
            index = this.readIndex(this.schemaFirstSELevel1);
            if (!this.checkEE(grammar, state, false)) {
                if (index == 0) {//EE
                    state.index = grammar.content.children - 1;
                    return 1;
                }
                index--;
            }
        }
        return this.decodeSEExtensionProduction(state, index);
    }

    this.decodeATWildcard = function(node, uriIndex) {
        var attribute = uriIndex==-1?this.decodeName():this.decodeNameWithURI(uriIndex);
        if (attribute.attributeID > 0) {
            // global attribute
            attribute = this.knowledge.attributes[attribute.attributeID];
            this.appendAttribute(node, attribute, this.processValue({ "type": attribute.type }, attribute.lvtID));
        }
        else {
            this.appendAttribute(node, attribute, this.processValue({ "type": "exi:string" }, attribute.lvtID));
        }
    }

    this.processCMPI = function(node) {
        var isEvtComment = this.isComment;
        if (this.isPI) {
            isEvtComment = this.isComment ? (this.readIndex(1) == 0) : false;
        }
        if (isEvtComment) {
            var child = this.decodeLitteralString();
            this.appendComment(node, child);
        }
        else {
            var name = this.decodeLitteralString();
            var text = this.decodeLitteralString();
            this.appendPI(node, name, text);
        }
        return node;
    }

    this.decodeContentExtensionProduction = function(state, index) {
        switch (index) {
            case 0: //SE(*)
                var element = this.decodeElementName();
                var child = this.processEvent(this.knowledge.elements[element.elementID]);
                this.appendElement(state.node, child, element);
                break;
            case 1: //CH
                var child = this.processValue({ "type": "exi:string"}, state.elementDescription.lvtID);
                this.appendCH(state.node, child);
                break;
            case 2: // ER or CMPI
                if (this.isDTD) {
                    var child = "&" + this.processValue({ "type": "litteralString" }) + ";";
                    this.appendCH(state.node, child);
                    break;
                }
            case 3: // CMPI
                this.processCMPI(state.node);
                break;
            default:
                //TODO: set error msg
                this.setError(-1, "1");
                return -1;
        }
        return 0;
    }

    this.decodeSchemaInformedSEExtension = function(state) {
        var grammar = state.elementDescription.grammar;
        if (isStrict) {
            //TODO: set error msg
            this.setError(-1, "1");
            return -1;
        }
        var index;
        if (!this.checkEE(grammar, state, false)) {
            index = this.readInteger(this.schemaSELevel1);
            if (index == 0) {//EE
                state.index = grammar.content.children - 1;
                state.isEnd = true;
                return 1;
            }
            index--;
        }
        else {
            index = this.readInteger(this.schemaSELevel1NoEE);
        }
        return this.decodeSEExtensionProduction(state, index + 2);
    }

    this.decodeSchemaInformedContentExtension = function(state) {
        var grammar = state.elementDescription.grammar;
        if (isStrict) {
            //TODO: set error msg
            this.setError(-1, "1");
            return -1;
        }
        var index;
        if (!this.checkEE(grammar, state, true)) {
            index = this.readInteger(this.schemaCTLevel1);
            if (index == 0) {//EE
                state.index = grammar.content.children - 1;
                state.isEnd = true;
                return 1;
            }
            index--;
        }
        else {
            index = this.readInteger(this.schemaCTLevel1NoEE);
        }
        this.decodeContentExtensionProduction(state, index);
        return 0;
    }


    this.decodeSchemaInformedSE = function(state) {
        var grammar = state.elementDescription.grammar;
        var attributeCount = grammar.start != null ? grammar.start.children.length : 0;
        var isContinuing = true;
        var isFirst = true;
        while (isContinuing) {
            var index = state.index + state.next;
            if (state.index >= 0 && index < attributeCount) {//attribute production
                var attrIndex = grammar.start.children[index];
                if (attrIndex < -1) {
                    // AT wilcards: -2=AT(*:*) -3=AT(uri1:*)
                    this.decodeATWildcard(state.node, -attrIndex - 3);
                }
                else {
                    // AT
                    var attr = this.knowledge.attributes[attrIndex];
                    this.appendAttribute(state.node,attr,this.processValue(attr, attr.lvtID));
                    // go to next production
                    state.next += state.index + 1;
                    // If next production is an attribute wildcard, we need to increment state.next until grammar.start[state.next]>=0
                    while (grammar.start[state.next] < 0) state.next++;
                    isFirst = false;
                }
                this.decodeNextSchemaInformedProduction(state, true);
            }
            else if (state.index <= state.choice) {// content production
                isContinuing = false;
                if (grammar.start != null) {
                    state.index = index - attributeCount;
                }
                state.next = 0;
            }
            else if (state.index == state.choice + 1) {// extension 
                var status = isFirst ? this.decodeFirstSchemaInformedSEExtension(state) :
                                                this.decodeSchemaInformedSEExtension(state);
                if (status != 0) {// got to content parsing
                    isContinuing = false;
                    this.decodeNextSchemaInformedProduction(state, false);
                    break;
                }
                else {
                    var numBits = this.computeNBitSize(isFirst ?
                            (state.choice + ((this.isStrict && !(grammar.xsiTypeNil > 0)) ? 0 : 1)) :
                            (state.choice + (this.isStrict ? 0 : 1))
                            );
                    state.index = this.readIndex(numBits);
                }
            }
            else {
                //TODO: set error msg
                this.setError(-1, "1");
                return -1;
            }
        }
    }

    this.decodeSchemaInformedContent = function(state) {
        var grammar = state.elementDescription.grammar;
        do {
            if (state.index > state.choice) {
                if (state.isEnd) {//unexpected EE from SE or content extension
                    return 0;
                }
                if (state.index == state.choice + 1) {// extension
                    this.decodeSchemaInformedContentExtension(state);
                }
                else {
                    // TODO: set error msg
                    this.setError(-1, "1");
                    return -1;
                }
            }
            else if (state.index >= 0) {
                state.index += state.next;
                var childNameIndex = grammar.content.children[state.index];
                if (childNameIndex >= 0) {
                    //SE
                    var childDesc = this.knowledge.elements[childNameIndex];
                    this.appendElement(state.node, this.processEvent(childDesc), childDesc);
                    state.next = grammar.content.next[state.index];
                    this.decodeNextSchemaInformedProduction(state, false);
                }
                else if (childNameIndex == -1) {
                    //EE
                    break;
                }
                else if (childNameIndex == -2) {
                    //CH
                    var child = this.processValue({ "type": grammar.type != null ? grammar.type : "exi:string"}, state.elementDescription.lvtID );
                    this.appendCH(state.node, child);
                    state.next = grammar.content.next[state.index];
                    this.decodeNextSchemaInformedProduction(state, false);
                }
                else if (childNameIndex < -2) {
                    // SE wilcards: -3=SE(*:*) -4=SE(uri1:*)
                    var childDesc = this.decodeElementNameWithURI(-4 - childNameIndex);
                    this.appendElement(state.node, this.processEvent(childDesc), childDesc);
                    this.decodeNextSchemaInformedProduction(state, false);
                }
            }
            else {
                //TODO: set error msg
                this.setError(-1, "1");
                return -1;
            }
        } while (true);
        return 0;
    }

    this.decodeSchemaInformedElement = function(elementDescription) {
        // schema-informed complex content grammar
        var grammar = elementDescription.grammar;
        var state = { "next": 0, "choice": grammar.initialChoice, "index": 0, "node": this.createElement(elementDescription.uri,elementDescription.name), "elementDescription": elementDescription };

        var numBits = this.computeNBitSize(state.choice + ((this.isStrict && !(grammar.xsiTypeNil > 0)) ? 0 : 1));
        state.index = this.readIndex(numBits);

        // SE parsing
        this.decodeSchemaInformedSE(state);
        // Content parsing
        this.decodeSchemaInformedContent(state);
        return state.node;
    }

    this.decodeSimpleTypedElement = function(elementDescription, inContent, node) {
        var grammar = elementDescription.grammar;
        // standard way of building grammars
        if (grammar.content == null) {
            grammar.initialChoice = 0;
            grammar.content = { "children": [-2, -1], "choices": [0, 0], "next": [1, 2] };
        }
        state = { "next": inContent ? 1 : 0, "choice": 0, "index": 1, "elementDescription": elementDescription, "node": node };
        if (!inContent) {
            // SE parsing
            this.decodeSchemaInformedSE(state);
        }
        // Content parsing
        this.decodeSchemaInformedContent(state);
        return state.node;
    }
}

