const realPerformance = window.performance;
const realNow = realPerformance.now.bind(realPerformance);

let autopause = false;
let speed = 1;
let startReal = realNow();
let startFake = startReal;

const proxyPerformance = new Proxy(realPerformance, {
    get(target, prop) {
        if (prop === "now") {
            return () => {
                const now = realNow();
                const elapsed = now - startReal;
                return startFake + elapsed * speed;
            };
        }
        return Reflect.get(target, prop);
    }
});

Object.defineProperty(window, "performance", {
    get() {
        return proxyPerformance;
    },
    configurable: true
});

window.setGameSpeed = function (newSpeed) {
    const realNowVal = realNow();
    const currentFake = proxyPerformance.now();
    startReal = realNowVal;
    startFake = currentFake;
    speed = newSpeed;
};

class WasmCheatEngine {
    constructor() {
        this.foundAddresses = [];
        this.bookmarks = {};
        this.scanHistory = [];
        this.valueType = 'i32';
        this.initialized = false;

        this.createUI();

        this.checkWasmInstance();
    }

    checkWasmInstance() {
        const checkInterval = setInterval(() => {
            if (window.__wasmInstance) {
                this.initialize(window.__wasmInstance);
                clearInterval(checkInterval);
            }
        }, 1000);
    }

    initialize(wasmInstance) {
        if (this.initialized) return;

        this.wasmInstance = wasmInstance;
        this.memory = this.wasmInstance.exports.jj;
        this.memorySize = this.memory.buffer.byteLength;

        console.log(`[cheat engine ig] Initialized with ${this.memorySize} bytes of memory`);

        this.statusElement.textContent = `Connected to WASM Memory (${this.formatBytes(this.memorySize)})`;
        this.initialized = true;

        this.setupMemoryWatcher();
    }

    setupMemoryWatcher() {
        const originalGrow = this.memory.grow;
        this.memory.grow = (pages) => {
            const result = originalGrow.call(this.memory, pages);
            this.memorySize = this.memory.buffer.byteLength;
            console.log(`[cheat engine ig] Memory resized to ${this.formatBytes(this.memorySize)}`);
            this.statusElement.textContent = `Connected to WASM Memory (${this.formatBytes(this.memorySize)})`;
            return result;
        };
    }

    formatBytes(bytes) {
        if (bytes < 1024) return bytes + " bytes";
        else if (bytes < 1048576) return (bytes / 1024).toFixed(2) + " KB";
        else return (bytes / 1048576).toFixed(2) + " MB";
    }

    formatAddress(address) {
        return "0x" + address.toString(16).toUpperCase().padStart(8, '0');
    }

    getValue(address, type = this.valueType) {
        if (!this.initialized) return null;

        const view = new DataView(this.memory.buffer);
        try {
            switch (type) {
                case 'i8': return view.getInt8(address);
                case 'u8': return view.getUint8(address);
                case 'i16': return view.getInt16(address, true);
                case 'u16': return view.getUint16(address, true);
                case 'i32': return view.getInt32(address, true);
                case 'u32': return view.getUint32(address, true);
                case 'f32': return view.getFloat32(address, true);
                case 'f64': return view.getFloat64(address, true);
                default: return view.getInt32(address, true);
            }
        } catch (e) {
            console.warn(`[cheat engine ig] Error reading address ${this.formatAddress(address)}:`, e);
            return null;
        }
    }

    setValue(address, value, type = this.valueType) {
        if (!this.initialized) return false;

        const view = new DataView(this.memory.buffer);
        try {
            switch (type) {
                case 'i8': view.setInt8(address, value); break;
                case 'u8': view.setUint8(address, value); break;
                case 'i16': view.setInt16(address, value, true); break;
                case 'u16': view.setUint16(address, value, true); break;
                case 'i32': view.setInt32(address, value, true); break;
                case 'u32': view.setUint32(address, value, true); break;
                case 'f32': view.setFloat32(address, value, true); break;
                case 'f64': view.setFloat64(address, value, true); break;
                default: view.setInt32(address, value, true);
            }
            return true;
        } catch (e) {
            console.warn(`[cheat engine ig] Error writing to address ${this.formatAddress(address)}:`, e);
            return false;
        }
    }

    scanMemory(value, valueType = this.valueType, compareType = 'equal') {
        if (!this.initialized) return [];

        const results = [];
        const numValue = parseFloat(value);
        const view = new DataView(this.memory.buffer);

        let stepSize = 1;
        switch (valueType) {
            case 'i8': case 'u8': stepSize = 1; break;
            case 'i16': case 'u16': stepSize = 2; break;
            case 'i32': case 'u32': case 'f32': stepSize = 4; break;
            case 'f64': stepSize = 8; break;
        }

        for (let addr = 0; addr < this.memorySize - stepSize; addr += stepSize) {
            try {
                let currentValue;
                switch (valueType) {
                    case 'i8': currentValue = view.getInt8(addr); break;
                    case 'u8': currentValue = view.getUint8(addr); break;
                    case 'i16': currentValue = view.getInt16(addr, true); break;
                    case 'u16': currentValue = view.getUint16(addr, true); break;
                    case 'i32': currentValue = view.getInt32(addr, true); break;
                    case 'u32': currentValue = view.getUint32(addr, true); break;
                    case 'f32': currentValue = view.getFloat32(addr, true); break;
                    case 'f64': currentValue = view.getFloat64(addr, true); break;
                }

                let matched = false;
                switch (compareType) {
                    case 'equal': matched = currentValue === numValue; break;
                    case 'notEqual': matched = currentValue !== numValue; break;
                    case 'greater': matched = currentValue > numValue; break;
                    case 'less': matched = currentValue < numValue; break;
                    case 'changed':
                        if (this.foundAddresses.length > 0) {
                            const prevValue = this.getValue(addr, valueType);
                            matched = prevValue !== currentValue;
                        }
                        break;
                    case 'unchanged':
                        if (this.foundAddresses.length > 0) {
                            const prevValue = this.getValue(addr, valueType);
                            matched = prevValue === currentValue;
                        }
                        break;
                }

                if (matched) {
                    results.push({
                        address: addr,
                        value: currentValue,
                        type: valueType
                    });

                    if (results.length >= 10000) break;
                }
            } catch (e) {
            }
        }

        this.scanHistory.push({
            type: 'first',
            value: value,
            valueType: valueType,
            compareType: compareType,
            results: results
        });

        this.foundAddresses = results;
        return results;
    }

    narrowSearch(value, compareType = 'equal') {
        if (!this.initialized || this.foundAddresses.length === 0) return [];

        const results = [];
        const numValue = parseFloat(value);

        for (const item of this.foundAddresses) {
            try {
                const currentValue = this.getValue(item.address, item.type);

                let matched = false;
                switch (compareType) {
                    case 'equal': matched = currentValue === numValue; break;
                    case 'notEqual': matched = currentValue !== numValue; break;
                    case 'greater': matched = currentValue > numValue; break;
                    case 'less': matched = currentValue < numValue; break;
                    case 'changed': matched = currentValue !== item.value; break;
                    case 'unchanged': matched = currentValue === item.value; break;
                }

                if (matched) {
                    results.push({
                        address: item.address,
                        value: currentValue,
                        type: item.type
                    });
                }
            } catch (e) {
            }
        }

        this.scanHistory.push({
            type: 'narrow',
            value: value,
            compareType: compareType,
            results: results
        });

        this.foundAddresses = results;
        return results;
    }

    addBookmark(address, description = '', type = this.valueType) {
        const value = this.getValue(address, type);
        this.bookmarks[address] = {
            address,
            description,
            type,
            value
        };
        this.updateBookmarksUI();
        return this.bookmarks[address];
    }

    removeBookmark(address) {
        delete this.bookmarks[address];
        this.updateBookmarksUI();
    }

    createUI() {
        this.popupwindow = window.open(
            'about:blank',
            '_blank',
            'titlebar=no,toolbar=no,location=no,status=no,menubar=no,resizable=no,width=350,height=515'
        );

        this.mainstyle = document.createElement('style');
        this.mainstyle.textContent = `
            .option {
                background-color: rgba(0, 0, 0, 1);
            }
        `;

        this.container = document.createElement('div');
        this.container.id = "wasm_hax_bg"
        this.container.style.cssText = `
        position: fixed;
        top: 0px;
        right: 0px;
        width: 100%;
        background-color: rgba(0, 0, 0, 0.95);
        color: #eee;
        font-family: monospace;
        z-index: 9999;
        height: 100%;
        display: flex;
        flex-direction: column;
        border: none;
      `;

      function autoResizeWindow() {
        setTimeout(() => {
            // Get actual content size with margins
            const body = this.popupwindow.body;
            const html = this.container;
            
            const width = Math.max(
              body.scrollWidth, body.offsetWidth,
              html.scrollWidth, html.offsetWidth
            );
            
            const height = Math.max(
              body.scrollHeight, body.offsetHeight,
              html.scrollHeight, html.offsetHeight
            );
            
            // Add padding for window chrome
            const chromeWidth = this.popupwindow.outerWidth - this.popupwindow.innerWidth;
            const chromeHeight = this.popupwindow.outerHeight - this.popupwindow.innerHeight;
            
            // Resize with a minimum size
            this.popupwindow.resizeTo(
              Math.max(width + chromeWidth + 20, 100),
              Math.max(height + chromeHeight + 20, 100)
            );
          }, 100);
      }
      
      this.popupwindow.addEventListener('load', autoResizeWindow);

        this.statusElement = document.createElement('div');
        this.statusElement.style.cssText = `
        padding: 5px 10px;
        font-size: 12px;
        color: #aaa;
        border-bottom: 1px solid #444;
      `;
        this.statusElement.textContent = 'Waiting for WASM instance...';
        this.container.appendChild(this.statusElement);

        const contentArea = document.createElement('div');
        contentArea.style.cssText = `
        padding: 10px;
        overflow-y: auto;
        flex-grow: 1;
      `;
        this.container.appendChild(contentArea);

        const searchPanel = document.createElement('div');
        searchPanel.style.cssText = `
        margin-bottom: 15px;
      `;
        searchPanel.innerHTML = `
        <div style="margin-bottom: 10px;">
          <div style="margin-bottom: 5px;">Value type:</div>
          <select id="wce-value-type" style="color: #aaa;background-color: rgba(0, 0, 0, 0);font-family: monospace;border: 1px solid #444;width: 100%; padding: 5px;">
            <option class="option" value="i8">Int8</option>
            <option class="option" value="u8">Uint8</option>
            <option class="option" value="i16">Int16</option>
            <option class="option" value="u16">Uint16</option>
            <option class="option" value="i32" selected>Int32</option>
            <option class="option" value="u32">Uint32</option>
            <option class="option" value="f32">Float32</option>
            <option class="option" value="f64">Float64</option>
          </select>
        </div>
        
        <div style="margin-bottom: 10px;">
          <div style="margin-bottom: 5px;">Search type:</div>
          <select id="wce-search-type" style="color: #aaa;background-color: rgba(0, 0, 0, 0);font-family: monospace;border: 1px solid #444;width: 100%; padding: 5px;">
            <option class="option" value="equal">Exact Value</option>
            <option class="option" value="notEqual">Not Equal</option>
            <option class="option" value="greater">Greater Than</option>
            <option class="option" value="less">Less Than</option>
            <option class="option" value="changed">Value Changed</option>
            <option class="option" value="unchanged">Value Unchanged</option>
          </select>
        </div>

        <div style="margin-bottom: 10px;">
          <div style="margin-bottom: 5px;">Other:</div>
          <div style="display: flex; gap: 5px; align-items: center;">
              <div style="width: 35%; color:#aaa">Game Speed:</div>
              <input id="speed" type="text" style="color: #aaa;background-color: rgba(0, 0, 0, 0);font-family: monospace;border: 1px solid #444; width: 100%; padding: 5px;" value="1" placeholder="Game Speed">
          </div>
        <div style="height: 8px;"></div>
          <div style="display: flex; gap: 5px; align-items: center;">
              <div style="width: 35%; color:#aaa">Pause on Hover:</div>
              <select id="autopause" style="color: #aaa;background-color: rgba(0, 0, 0, 0);font-family: monospace;border: 1px solid #444;width: 100%; padding: 5px;" value="off">
              <option class="option" value="off">Off</option>
              <option class="option" value="on">On</option></option>
              </select>
          </div>
        </div>
        
        <div style="margin-bottom: 10px;">
          <div style="margin-bottom: 5px;">Value:</div>
          <input id="wce-value" type="text" style="color: #aaa;background-color: rgba(0, 0, 0, 0);font-family: monospace;border: 1px solid #444;width: 100%; padding: 5px;" placeholder="Enter value to search">   
      </div>
        
        <div style="display: flex; gap: 5px;"> 
          <button id="wce-first-scan" style="color: #aaa;background-color: rgba(0, 0, 0, 0);font-family: monospace;border: 1px solid #444;flex: 1; padding: 5px;">First Scan</button>
          <button id="wce-next-scan" style="color: #aaa;background-color: rgba(0, 0, 0, 0);font-family: monospace;border: 1px solid #444;flex: 1; padding: 5px;" disabled>Next Scan</button>
          <button id="wce-reset" style="color: #aaa;background-color: rgba(0, 0, 0, 0);font-family: monospace;border: 1px solid #444;padding: 5px;">Reset</button>
        </div>
      `;
        contentArea.appendChild(searchPanel);

        const resultsPanel = document.createElement('div');
        resultsPanel.style.cssText = `
        margin-bottom: 15px;
        max-height: 200px;
        overflow-y: auto;
        border: 1px solid #444;
      `;
        this.resultsElement = document.createElement('table');
        this.resultsElement.style.cssText = `
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      `;
        this.resultsElement.innerHTML = `
        <thead>
          <tr>
            <th style="padding: 5px;color: #aaa; text-align: left; border-bottom: 1px solid #444;">Address</th>
            <th style="padding: 5px;color: #aaa; text-align: left; border-bottom: 1px solid #444;">Value</th>
            <th style="padding: 5px;color: #aaa; text-align: left; border-bottom: 1px solid #444;">Actions</th>
          </tr>
        </thead>
        <tbody id="wce-results-body">
          <tr>
            <td colspan="3" style="padding: 10px;color: #aaa; text-align: center;">No results yet</td>
          </tr>
        </tbody>
      `;
        resultsPanel.appendChild(this.resultsElement);
        contentArea.appendChild(resultsPanel);

        const bookmarksPanel = document.createElement('div');
        bookmarksPanel.innerHTML = `
        <div style="margin-bottom: 5px; color: #aaa; font-weight: bold;">Bookmarks</div>
      `;
        this.bookmarksElement = document.createElement('table');
        this.bookmarksElement.style.cssText = `
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
        border: 1px solid #444;
        border-radius: 3px;
      `;
        this.bookmarksElement.innerHTML = `
        <thead>
          <tr>
            <th style="padding: 5px; color: #aaa; text-align: left; border-bottom: 1px solid #444;">Description</th>
            <th style="padding: 5px; color: #aaa; text-align: left; border-bottom: 1px solid #444;">Address</th>
            <th style="padding: 5px; color: #aaa; text-align: left; border-bottom: 1px solid #444;">Value</th>
            <th style="padding: 5px; color: #aaa; text-align: left; border-bottom: 1px solid #444;">Actions</th>
          </tr>
        </thead>
        <tbody id="wce-bookmarks-body">
          <tr>
            <td colspan="4" style="padding: 10px; color: #aaa; text-align: center;">No bookmarks yet</td>
          </tr>
        </tbody>
      `;
        bookmarksPanel.appendChild(this.bookmarksElement);
        contentArea.appendChild(bookmarksPanel);

        this.popupwindow.document.body.appendChild(this.container);
        this.popupwindow.document.body.appendChild(this.mainstyle);

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.popupwindow.document.getElementById("speed").addEventListener("change", (e) => {
            setGameSpeed(this.popupwindow.document.getElementById("speed").value);
        });

        this.popupwindow.document.getElementById("autopause").addEventListener("change", (e) => {
            if (this.popupwindow.document.getElementById("autopause").value == "on") {
                autopause = true;
            } else {
                autopause = false;
            }
        });

        this.container.addEventListener("mouseover", (e) => {
            if (autopause != true) {
                return;
            }

            setGameSpeed(0);
        });

        this.container.addEventListener("mouseout", (e) => {
            setGameSpeed(this.popupwindow.document.getElementById("speed").value);
        });

        this.popupwindow.document.getElementById('wce-first-scan').addEventListener('click', () => {
            const value = this.popupwindow.document.getElementById('wce-value').value;
            const valueType = this.popupwindow.document.getElementById('wce-value-type').value;
            const compareType = this.popupwindow.document.getElementById('wce-search-type').value;

            this.valueType = valueType;
            const results = this.scanMemory(value, valueType, compareType);
            this.updateResultsUI(results);

            this.popupwindow.document.getElementById('wce-next-scan').disabled = false;
        });

        this.popupwindow.document.getElementById('wce-next-scan').addEventListener('click', () => {
            const value = this.popupwindow.document.getElementById('wce-value').value;
            const compareType = this.popupwindow.document.getElementById('wce-search-type').value;

            const results = this.narrowSearch(value, compareType);
            this.updateResultsUI(results);
        });

        this.popupwindow.document.getElementById('wce-reset').addEventListener('click', () => {
            this.foundAddresses = [];
            this.scanHistory = [];
            this.popupwindow.document.getElementById('wce-next-scan').disabled = true;
            this.updateResultsUI([]);
        });
    }

    makeDraggable(element) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

        element.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e = e || window.event;
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            this.popupwindow.document.onmouseup = closeDragElement;
            this.popupwindow.document.onmousemove = elementDrag;
        }

        const self = this;

        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            self.container.style.top = (self.container.offsetTop - pos2) + "px";
            self.container.style.left = (self.container.offsetLeft - pos1) + "px";
            self.container.style.right = "auto";
        }

        function closeDragElement() {
            this.popupwindow.document.onmouseup = null;
            this.popupwindow.document.onmousemove = null;
        }
    }

    updateResultsUI(results) {
        const tbody = this.popupwindow.document.getElementById('wce-results-body');

        if (results.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="padding: 10px; color: #aaa; text-align: center;">No results found</td></tr>';
            return;
        }

        const displayResults = results.slice(0, 100);

        tbody.innerHTML = displayResults.map(result => `
        <tr style="color: #aaa">
          <td style="padding: 5px;color: #aaa; border-bottom: 1px solid #333;">${this.formatAddress(result.address)}</td>
          <td style="padding: 5px;color: #aaa; border-bottom: 1px solid #333;">${result.value}</td>
          <td style="padding: 5px;color: #aaa; border-bottom: 1px solid #333;">
            <button class="wce-edit-value" style="color: #aaa;background-color: rgba(0, 0, 0, 0);font-family: monospace;border: none;" data-address="${result.address}" data-type="${result.type}">Edit</button>
            <button class="wce-bookmark" style="color: #aaa;background-color: rgba(0, 0, 0, 0);font-family: monospace;border: none;" data-address="${result.address}" data-type="${result.type}">★</button>
          </td>
        </tr>
      `).join('');

        this.statusElement.textContent = `Found ${results.length} results`;

        const editButtons = this.popupwindow.document.querySelectorAll('.wce-edit-value');
        editButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const address = parseInt(e.target.getAttribute('data-address'));
                const type = e.target.getAttribute('data-type');
                const currentValue = this.getValue(address, type);

                const newValue = prompt(`Edit value at address ${this.formatAddress(address)}`, currentValue);
                if (newValue !== null) {
                    this.setValue(address, parseFloat(newValue), type);
                    e.target.parentNode.previousSibling.textContent = parseFloat(newValue);
                }
            });
        });

        const bookmarkButtons = this.popupwindow.document.querySelectorAll('.wce-bookmark');
        bookmarkButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const address = parseInt(e.target.getAttribute('data-address'));
                const type = e.target.getAttribute('data-type');
                const description = prompt('Enter a description for this bookmark', `Value at ${this.formatAddress(address)}`);

                if (description !== null) {
                    this.addBookmark(address, description, type);
                }
            });
        });
    }

    updateBookmarksUI() {
        const tbody = this.popupwindow.document.getElementById('wce-bookmarks-body');

        if (Object.keys(this.bookmarks).length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="padding: 10px;color: #aaa; text-align: center;">No bookmarks yet</td></tr>';
            return;
        }

        tbody.innerHTML = Object.values(this.bookmarks).map(bookmark => {
            const currentValue = this.getValue(bookmark.address, bookmark.type);

            return `
          <tr>
            <td style="padding: 5px;color: #aaa; border-bottom: 1px solid #333;">${bookmark.description}</td>
            <td style="padding: 5px;color: #aaa; border-bottom: 1px solid #333;">${this.formatAddress(bookmark.address)}</td>
            <td style="padding: 5px;color: #aaa; border-bottom: 1px solid #333;">${currentValue}</td>
            <td style="padding: 5px;color: #aaa; border-bottom: 1px solid #333;">
              <button class="wce-bookmark-edit" style="color: #aaa;background-color: rgba(0, 0, 0, 0);font-family: monospace;border: none;" data-address="${bookmark.address}">Edit</button>
              <button class="wce-bookmark-remove" style="color: #aaa;background-color: rgba(0, 0, 0, 0);font-family: monospace;border: none;" data-address="${bookmark.address}">×</button>
            </td>
          </tr>
        `;
        }).join('');

        const editButtons = this.popupwindow.document.querySelectorAll('.wce-bookmark-edit');
        editButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const address = parseInt(e.target.getAttribute('data-address'));
                const bookmark = this.bookmarks[address];
                const currentValue = this.getValue(address, bookmark.type);

                const newValue = prompt(`Edit value at address ${this.formatAddress(address)}`, currentValue);
                if (newValue !== null) {
                    this.setValue(address, parseFloat(newValue), bookmark.type);
                    this.updateBookmarksUI();
                }
            });
        });

        const removeButtons = this.popupwindow.document.querySelectorAll('.wce-bookmark-remove');
        removeButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const address = parseInt(e.target.getAttribute('data-address'));
                this.removeBookmark(address);
            });
        });
    }

    getAPI() {
        return {
            getValue: this.getValue.bind(this),
            setValue: this.setValue.bind(this),
            scan: this.scanMemory.bind(this),
            narrow: this.narrowSearch.bind(this),
            bookmark: this.addBookmark.bind(this),
            memory: () => this.memory,
            instance: () => this.wasmInstance,
            formatAddress: this.formatAddress.bind(this)
        };
    }
}

let i = WebAssembly.instantiate,
    s = WebAssembly.instantiateStreaming;

WebAssembly.instantiate = async function (b, x) {
    let r = await i.call(this, b, x);

    window.__wasmInstance = r.instance;
    window.__wasmModule = r.module;

    return r;
};

WebAssembly.instantiateStreaming = async function (b, x) {
    let r = await s.call(this, b, x);

    window.__wasmInstance = r.instance;
    window.__wasmModule = r.module;

    return r;
};

(function () {
    const allListeners = new Map();

    const origAdd = EventTarget.prototype.addEventListener;
    const origRemove = EventTarget.prototype.removeEventListener;

    EventTarget.prototype.addEventListener = function (type, listener, options) {
        if (!allListeners.has(this)) {
            allListeners.set(this, {});
        }

        const listenerMap = allListeners.get(this);
        if (!listenerMap[type]) {
            listenerMap[type] = [];
        }

        listenerMap[type].push({ listener, options });
        origAdd.call(this, type, listener, options);
    };

    EventTarget.prototype.removeEventListener = function (type, listener, options) {
        if (allListeners.has(this)) {
            const listenerMap = allListeners.get(this);
            if (listenerMap[type]) {
                listenerMap[type] = listenerMap[type].filter(
                    l => l.listener !== listener
                );
            }
        }

        origRemove.call(this, type, listener, options);
    };

    window.getAllListeners = function (element) {
        return allListeners.get(element) || {};
    };
})();


document.addEventListener("DOMContentLoaded", function (event) {
    const wasmCheatEngine = new WasmCheatEngine();

    window.wasmCheat = wasmCheatEngine.getAPI();
    console.log('[cheat engine ig] Initialized. Access API via window.wasmCheat');
});
