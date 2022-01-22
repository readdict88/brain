'use strict';

var obsidian = require('obsidian');

class Settings {
    constructor() {
        this.fileDirections = {};
        this.defaultDirection = 'ltr';
        this.rememberPerFile = true;
        this.setNoteTitleDirection = true;
        this.setYamlDirection = false;
    }
    toJson() {
        return JSON.stringify(this);
    }
    fromJson(content) {
        var obj = JSON.parse(content);
        this.fileDirections = obj['fileDirections'];
        this.defaultDirection = obj['defaultDirection'];
        this.rememberPerFile = obj['rememberPerFile'];
        this.setNoteTitleDirection = obj['setNoteTitleDirection'];
    }
}
class RtlPlugin extends obsidian.Plugin {
    constructor() {
        super(...arguments);
        this.settings = new Settings();
        this.SETTINGS_PATH = '.obsidian/rtl.json';
        this.editorMode = null;
        // This stores the value in CodeMirror's autoCloseBrackets option before overriding it, so it can be restored when
        // we're back to LTR
        this.autoCloseBracketsValue = false;
    }
    onload() {
        var _a;
        if ((_a = this.app.vault.config) === null || _a === void 0 ? void 0 : _a.legacyEditor) {
            this.editorMode = 'cm5';
            console.log('RTL plugin: using CodeMirror 5 mode');
        }
        else {
            this.editorMode = 'cm6';
            console.log('RTL plugin: using CodeMirror 6 mode');
        }
        this.addCommand({
            id: 'switch-text-direction',
            name: 'Switch Text Direction (LTR<>RTL)',
            callback: () => { this.toggleDocumentDirection(); }
        });
        this.addSettingTab(new RtlSettingsTab(this.app, this));
        this.loadSettings();
        this.registerEvent(this.app.workspace.on('file-open', (file) => {
            if (file && file.path) {
                this.syncDefaultDirection();
                this.currentFile = file;
                this.adjustDirectionToCurrentFile();
            }
        }));
        this.registerEvent(this.app.vault.on('delete', (file) => {
            if (file && file.path && file.path in this.settings.fileDirections) {
                delete this.settings.fileDirections[file.path];
                this.saveSettings();
            }
        }));
        this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
            if (file && file.path && oldPath in this.settings.fileDirections) {
                this.settings.fileDirections[file.path] = this.settings.fileDirections[oldPath];
                delete this.settings.fileDirections[oldPath];
                this.saveSettings();
            }
        }));
        if (this.editorMode === 'cm5') {
            this.registerCodeMirror((cm) => {
                let cmEditor = cm;
                let currentExtraKeys = cmEditor.getOption('extraKeys');
                let moreKeys = {
                    'End': (cm) => {
                        if (cm.getOption('direction') == 'rtl')
                            cm.execCommand('goLineLeftSmart');
                        else
                            cm.execCommand('goLineRight');
                    },
                    'Home': (cm) => {
                        if (cm.getOption('direction') == 'rtl')
                            cm.execCommand('goLineRight');
                        else
                            cm.execCommand('goLineLeftSmart');
                    }
                };
                cmEditor.setOption('extraKeys', Object.assign({}, currentExtraKeys, moreKeys));
            });
        }
    }
    onunload() {
        console.log('unloading RTL plugin');
    }
    adjustDirectionToCurrentFile() {
        if (this.currentFile && this.currentFile.path) {
            let requiredDirection = null;
            const frontMatterDirection = this.getFrontMatterDirection(this.currentFile);
            if (frontMatterDirection) {
                if (frontMatterDirection == 'rtl' || frontMatterDirection == 'ltr')
                    requiredDirection = frontMatterDirection;
                else
                    console.log('Front matter direction in file', this.currentFile.path, 'is unknown:', frontMatterDirection);
            }
            else if (this.settings.rememberPerFile && this.currentFile.path in this.settings.fileDirections) {
                // If the user wants to remember the direction per file, and we have a direction set for this file -- use it
                requiredDirection = this.settings.fileDirections[this.currentFile.path];
            }
            else {
                // Use the default direction
                requiredDirection = this.settings.defaultDirection;
            }
            this.setDocumentDirection(requiredDirection);
        }
    }
    saveSettings() {
        var settings = this.settings.toJson();
        this.app.vault.adapter.write(this.SETTINGS_PATH, settings);
    }
    loadSettings() {
        this.app.vault.adapter.read(this.SETTINGS_PATH).
            then((content) => this.settings.fromJson(content)).
            catch(error => { console.log("RTL settings file not found"); });
    }
    getCmEditor() {
        var _a;
        let view = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (view)
            return (_a = view.sourceMode) === null || _a === void 0 ? void 0 : _a.cmEditor;
        return null;
    }
    setDocumentDirection(newDirection) {
        var _a, _b, _c;
        let view = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        // Source / Live View editor direction
        if (this.editorMode === 'cm5') {
            var cmEditor = this.getCmEditor();
            if (cmEditor && cmEditor.getOption("direction") != newDirection) {
                this.patchAutoCloseBrackets(cmEditor, newDirection);
                cmEditor.setOption("direction", newDirection);
                cmEditor.setOption("rtlMoveVisually", true);
            }
        }
        else {
            if (!view.editor)
                return;
            this.replacePageStyleByString('New editor content div', `/* New editor content div */ .cm-editor { direction: ${newDirection}; }`, true);
            this.replacePageStyleByString('Markdown preview RTL', `/* Markdown preview RTL */ .markdown-preview-view { direction: ${newDirection}; }`, true);
            var containerEl = (_c = (_b = (_a = view.editor.getDoc()) === null || _a === void 0 ? void 0 : _a.cm) === null || _b === void 0 ? void 0 : _b.dom) === null || _c === void 0 ? void 0 : _c.parentElement;
            if (newDirection === 'rtl') {
                containerEl.classList.add('is-rtl');
                this.replacePageStyleByString('List indent fix', `/* List indent fix */ .cm-s-obsidian .HyperMD-list-line { text-indent: 0px !important; }`, true);
            }
            else {
                containerEl.classList.remove('is-rtl');
                this.replacePageStyleByString('List indent fix', `/* List indent fix */ /* Empty rule for LTR */`, true);
            }
            this.replacePageStyleByString('Embedded links always LTR', `/* Embedded links always LTR */ .embedded-backlinks { direction: ltr; }`, true);
            view.editor.refresh();
        }
        if (view) {
            // Fix the list indentation style
            this.replacePageStyleByString('CodeMirror-rtl pre', `.CodeMirror-rtl pre { text-indent: 0px !important; }`, true);
            if (this.settings.setYamlDirection) {
                const alignSide = newDirection == 'rtl' ? 'right' : 'left';
                this.replacePageStyleByString('Patch YAML', `/* Patch YAML RTL */ .language-yml code { text-align: ${alignSide}; }`, true);
            }
            if (this.settings.setNoteTitleDirection) {
                var leafContainer = this.app.workspace.activeLeaf.containerEl;
                let header = leafContainer.getElementsByClassName('view-header-title-container');
                header[0].style.direction = newDirection;
            }
            this.setExportDirection(newDirection);
        }
    }
    setExportDirection(newDirection) {
        this.replacePageStyleByString('searched and replaced', `/* This is searched and replaced by the plugin */ @media print { body { direction: ${newDirection}; } }`, false);
    }
    replacePageStyleByString(searchString, newStyle, addIfNotFound) {
        let styles = document.head.getElementsByTagName('style');
        let found = false;
        for (let style of styles) {
            if (style.getText().includes(searchString)) {
                style.setText(newStyle);
                found = true;
            }
        }
        if (!found && addIfNotFound) {
            let style = document.createElement('style');
            style.textContent = newStyle;
            document.head.appendChild(style);
        }
    }
    findPageStyle(searchString) {
        let styles = document.head.getElementsByTagName('style');
        for (let style of styles) {
            if (style.getText().includes(searchString))
                return true;
        }
        return false;
    }
    patchAutoCloseBrackets(cmEditor, newDirection) {
        // Auto-close brackets doesn't work in RTL: https://github.com/esm7/obsidian-rtl/issues/7
        // Until the actual fix is released (as part of CodeMirror), we store the value of autoCloseBrackets when
        // switching to RTL, overriding it to 'false' and restoring it when back to LTR.
        if (newDirection == 'rtl') {
            this.autoCloseBracketsValue = cmEditor.getOption('autoCloseBrackets');
            cmEditor.setOption('autoCloseBrackets', false);
        }
        else {
            cmEditor.setOption('autoCloseBrackets', this.autoCloseBracketsValue);
        }
    }
    toggleDocumentDirection() {
        let newDirection = this.getDocumentDirection() === 'ltr' ? 'rtl' : 'ltr';
        this.setDocumentDirection(newDirection);
        if (this.settings.rememberPerFile && this.currentFile && this.currentFile.path) {
            this.settings.fileDirections[this.currentFile.path] = newDirection;
            this.saveSettings();
        }
    }
    getDocumentDirection() {
        if (this.editorMode === 'cm5') {
            var cmEditor = this.getCmEditor();
            return (cmEditor === null || cmEditor === void 0 ? void 0 : cmEditor.getOption('direction')) === 'rtl' ? 'rtl' : 'ltr';
        }
        else {
            return this.findPageStyle('direction: rtl') ? 'rtl' : 'ltr';
        }
    }
    getFrontMatterDirection(file) {
        const fileCache = this.app.metadataCache.getFileCache(file);
        const frontMatter = fileCache === null || fileCache === void 0 ? void 0 : fileCache.frontmatter;
        if (frontMatter && (frontMatter === null || frontMatter === void 0 ? void 0 : frontMatter.direction)) {
            try {
                const direction = frontMatter.direction;
                return direction;
            }
            catch (error) { }
        }
    }
    syncDefaultDirection() {
        // Sync the plugin default direction with Obsidian's own setting
        const obsidianDirection = this.app.vault.getConfig('rightToLeft') ? 'rtl' : 'ltr';
        if (obsidianDirection != this.settings.defaultDirection) {
            this.settings.defaultDirection = obsidianDirection;
            this.saveSettings();
        }
    }
}
class RtlSettingsTab extends obsidian.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.settings = plugin.settings;
    }
    display() {
        let { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'RTL Settings' });
        this.plugin.syncDefaultDirection();
        new obsidian.Setting(containerEl)
            .setName('Remember text direction per file')
            .setDesc('Store and remember the text direction used for each file individually.')
            .addToggle(toggle => toggle.setValue(this.settings.rememberPerFile)
            .onChange((value) => {
            this.settings.rememberPerFile = value;
            this.plugin.saveSettings();
            this.plugin.adjustDirectionToCurrentFile();
        }));
        new obsidian.Setting(containerEl)
            .setName('Default text direction')
            .setDesc('What should be the default text direction in Obsidian?')
            .addDropdown(dropdown => dropdown.addOption('ltr', 'LTR')
            .addOption('rtl', 'RTL')
            .setValue(this.settings.defaultDirection)
            .onChange((value) => {
            this.settings.defaultDirection = value;
            this.app.vault.setConfig('rightToLeft', value == 'rtl');
            this.plugin.saveSettings();
            this.plugin.adjustDirectionToCurrentFile();
        }));
        new obsidian.Setting(containerEl)
            .setName('Set note title direction')
            .setDesc('In RTL notes, also set the direction of the note title.')
            .addToggle(toggle => toggle.setValue(this.settings.setNoteTitleDirection)
            .onChange((value) => {
            this.settings.setNoteTitleDirection = value;
            this.plugin.saveSettings();
            this.plugin.adjustDirectionToCurrentFile();
        }));
        new obsidian.Setting(containerEl)
            .setName('Set YAML direction in Preview')
            .setDesc('For RTL notes, preview YAML blocks as RTL. (When turning off, restart of Obsidian is required.)')
            .addToggle(toggle => {
            var _a;
            return toggle.setValue((_a = this.settings.setYamlDirection) !== null && _a !== void 0 ? _a : false)
                .onChange((value) => {
                this.settings.setYamlDirection = value;
                this.plugin.saveSettings();
                this.plugin.adjustDirectionToCurrentFile();
            });
        });
    }
}

module.exports = RtlPlugin;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXMiOlsibWFpbi50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcHAsIEVkaXRvciwgTWFya2Rvd25WaWV3LCBQbHVnaW4sIFBsdWdpblNldHRpbmdUYWIsIFRGaWxlLCBUQWJzdHJhY3RGaWxlLCBTZXR0aW5nIH0gZnJvbSAnb2JzaWRpYW4nO1xyXG5pbXBvcnQgKiBhcyBjb2RlbWlycm9yIGZyb20gJ2NvZGVtaXJyb3InO1xyXG5cclxuY2xhc3MgU2V0dGluZ3Mge1xyXG5cdHB1YmxpYyBmaWxlRGlyZWN0aW9uczogeyBbcGF0aDogc3RyaW5nXTogc3RyaW5nIH0gPSB7fTtcclxuXHRwdWJsaWMgZGVmYXVsdERpcmVjdGlvbjogc3RyaW5nID0gJ2x0cic7XHJcblx0cHVibGljIHJlbWVtYmVyUGVyRmlsZTogYm9vbGVhbiA9IHRydWU7XHJcblx0cHVibGljIHNldE5vdGVUaXRsZURpcmVjdGlvbjogYm9vbGVhbiA9IHRydWU7XHJcblx0cHVibGljIHNldFlhbWxEaXJlY3Rpb246IGJvb2xlYW4gPSBmYWxzZTtcclxuXHJcblx0dG9Kc29uKCkge1xyXG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHRoaXMpO1xyXG5cdH1cclxuXHJcblx0ZnJvbUpzb24oY29udGVudDogc3RyaW5nKSB7XHJcblx0XHR2YXIgb2JqID0gSlNPTi5wYXJzZShjb250ZW50KTtcclxuXHRcdHRoaXMuZmlsZURpcmVjdGlvbnMgPSBvYmpbJ2ZpbGVEaXJlY3Rpb25zJ107XHJcblx0XHR0aGlzLmRlZmF1bHREaXJlY3Rpb24gPSBvYmpbJ2RlZmF1bHREaXJlY3Rpb24nXTtcclxuXHRcdHRoaXMucmVtZW1iZXJQZXJGaWxlID0gb2JqWydyZW1lbWJlclBlckZpbGUnXTtcclxuXHRcdHRoaXMuc2V0Tm90ZVRpdGxlRGlyZWN0aW9uID0gb2JqWydzZXROb3RlVGl0bGVEaXJlY3Rpb24nXTtcclxuXHR9XHJcbn1cclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFJ0bFBsdWdpbiBleHRlbmRzIFBsdWdpbiB7XHJcblxyXG5cdHB1YmxpYyBzZXR0aW5ncyA9IG5ldyBTZXR0aW5ncygpO1xyXG5cdHByaXZhdGUgY3VycmVudEZpbGU6IFRGaWxlO1xyXG5cdHB1YmxpYyBTRVRUSU5HU19QQVRIID0gJy5vYnNpZGlhbi9ydGwuanNvbidcclxuXHRwcml2YXRlIGVkaXRvck1vZGU6ICdjbTUnIHwgJ2NtNicgPSBudWxsO1xyXG5cdC8vIFRoaXMgc3RvcmVzIHRoZSB2YWx1ZSBpbiBDb2RlTWlycm9yJ3MgYXV0b0Nsb3NlQnJhY2tldHMgb3B0aW9uIGJlZm9yZSBvdmVycmlkaW5nIGl0LCBzbyBpdCBjYW4gYmUgcmVzdG9yZWQgd2hlblxyXG5cdC8vIHdlJ3JlIGJhY2sgdG8gTFRSXHJcblx0cHJpdmF0ZSBhdXRvQ2xvc2VCcmFja2V0c1ZhbHVlOiBhbnkgPSBmYWxzZTtcclxuXHJcblx0b25sb2FkKCkge1xyXG5cdFx0aWYgKCh0aGlzLmFwcC52YXVsdCBhcyBhbnkpLmNvbmZpZz8ubGVnYWN5RWRpdG9yKSB7XHJcblx0XHRcdHRoaXMuZWRpdG9yTW9kZSA9ICdjbTUnO1xyXG5cdFx0XHRjb25zb2xlLmxvZygnUlRMIHBsdWdpbjogdXNpbmcgQ29kZU1pcnJvciA1IG1vZGUnKTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdHRoaXMuZWRpdG9yTW9kZSA9ICdjbTYnO1xyXG5cdFx0XHRjb25zb2xlLmxvZygnUlRMIHBsdWdpbjogdXNpbmcgQ29kZU1pcnJvciA2IG1vZGUnKTtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLmFkZENvbW1hbmQoe1xyXG5cdFx0XHRpZDogJ3N3aXRjaC10ZXh0LWRpcmVjdGlvbicsXHJcblx0XHRcdG5hbWU6ICdTd2l0Y2ggVGV4dCBEaXJlY3Rpb24gKExUUjw+UlRMKScsXHJcblx0XHRcdGNhbGxiYWNrOiAoKSA9PiB7IHRoaXMudG9nZ2xlRG9jdW1lbnREaXJlY3Rpb24oKTsgfVxyXG5cdFx0fSk7XHJcblxyXG5cdFx0dGhpcy5hZGRTZXR0aW5nVGFiKG5ldyBSdGxTZXR0aW5nc1RhYih0aGlzLmFwcCwgdGhpcykpO1xyXG5cclxuXHRcdHRoaXMubG9hZFNldHRpbmdzKCk7XHJcblxyXG5cdFx0dGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLndvcmtzcGFjZS5vbignZmlsZS1vcGVuJywgKGZpbGU6IFRGaWxlKSA9PiB7XHJcblx0XHRcdGlmIChmaWxlICYmIGZpbGUucGF0aCkge1xyXG5cdFx0XHRcdHRoaXMuc3luY0RlZmF1bHREaXJlY3Rpb24oKTtcclxuXHRcdFx0XHR0aGlzLmN1cnJlbnRGaWxlID0gZmlsZTtcclxuXHRcdFx0XHR0aGlzLmFkanVzdERpcmVjdGlvblRvQ3VycmVudEZpbGUoKTtcclxuXHRcdFx0fVxyXG5cdFx0fSkpO1xyXG5cclxuXHRcdHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC52YXVsdC5vbignZGVsZXRlJywgKGZpbGU6IFRBYnN0cmFjdEZpbGUpID0+IHtcclxuXHRcdFx0aWYgKGZpbGUgJiYgZmlsZS5wYXRoICYmIGZpbGUucGF0aCBpbiB0aGlzLnNldHRpbmdzLmZpbGVEaXJlY3Rpb25zKSB7XHJcblx0XHRcdFx0ZGVsZXRlIHRoaXMuc2V0dGluZ3MuZmlsZURpcmVjdGlvbnNbZmlsZS5wYXRoXTtcclxuXHRcdFx0XHR0aGlzLnNhdmVTZXR0aW5ncygpO1xyXG5cdFx0XHR9XHJcblx0XHR9KSk7XHJcblxyXG5cdFx0dGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLnZhdWx0Lm9uKCdyZW5hbWUnLCAoZmlsZTogVEFic3RyYWN0RmlsZSwgb2xkUGF0aDogc3RyaW5nKSA9PiB7XHJcblx0XHRcdGlmIChmaWxlICYmIGZpbGUucGF0aCAmJiBvbGRQYXRoIGluIHRoaXMuc2V0dGluZ3MuZmlsZURpcmVjdGlvbnMpIHtcclxuXHRcdFx0XHR0aGlzLnNldHRpbmdzLmZpbGVEaXJlY3Rpb25zW2ZpbGUucGF0aF0gPSB0aGlzLnNldHRpbmdzLmZpbGVEaXJlY3Rpb25zW29sZFBhdGhdO1xyXG5cdFx0XHRcdGRlbGV0ZSB0aGlzLnNldHRpbmdzLmZpbGVEaXJlY3Rpb25zW29sZFBhdGhdO1xyXG5cdFx0XHRcdHRoaXMuc2F2ZVNldHRpbmdzKCk7XHJcblx0XHRcdH1cclxuXHRcdH0pKTtcclxuXHJcblx0XHRpZiAodGhpcy5lZGl0b3JNb2RlID09PSAnY201Jykge1xyXG5cdFx0XHR0aGlzLnJlZ2lzdGVyQ29kZU1pcnJvcigoY206IENvZGVNaXJyb3IuRWRpdG9yKSA9PiB7XHJcblx0XHRcdFx0bGV0IGNtRWRpdG9yID0gY207XHJcblx0XHRcdFx0bGV0IGN1cnJlbnRFeHRyYUtleXMgPSBjbUVkaXRvci5nZXRPcHRpb24oJ2V4dHJhS2V5cycpO1xyXG5cdFx0XHRcdGxldCBtb3JlS2V5cyA9IHtcclxuXHRcdFx0XHRcdCdFbmQnOiAoY206IENvZGVNaXJyb3IuRWRpdG9yKSA9PiB7XHJcblx0XHRcdFx0XHRcdGlmIChjbS5nZXRPcHRpb24oJ2RpcmVjdGlvbicpID09ICdydGwnKVxyXG5cdFx0XHRcdFx0XHRcdGNtLmV4ZWNDb21tYW5kKCdnb0xpbmVMZWZ0U21hcnQnKTtcclxuXHRcdFx0XHRcdFx0ZWxzZVxyXG5cdFx0XHRcdFx0XHRcdGNtLmV4ZWNDb21tYW5kKCdnb0xpbmVSaWdodCcpO1xyXG5cdFx0XHRcdFx0fSxcclxuXHRcdFx0XHRcdCdIb21lJzogKGNtOiBDb2RlTWlycm9yLkVkaXRvcikgPT4ge1xyXG5cdFx0XHRcdFx0XHRpZiAoY20uZ2V0T3B0aW9uKCdkaXJlY3Rpb24nKSA9PSAncnRsJylcclxuXHRcdFx0XHRcdFx0XHRjbS5leGVjQ29tbWFuZCgnZ29MaW5lUmlnaHQnKTtcclxuXHRcdFx0XHRcdFx0ZWxzZVxyXG5cdFx0XHRcdFx0XHRcdGNtLmV4ZWNDb21tYW5kKCdnb0xpbmVMZWZ0U21hcnQnKTtcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHR9O1xyXG5cdFx0XHRcdGNtRWRpdG9yLnNldE9wdGlvbignZXh0cmFLZXlzJywgT2JqZWN0LmFzc2lnbih7fSwgY3VycmVudEV4dHJhS2V5cywgbW9yZUtleXMpKTtcclxuXHRcdFx0fSk7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHRvbnVubG9hZCgpIHtcclxuXHRcdGNvbnNvbGUubG9nKCd1bmxvYWRpbmcgUlRMIHBsdWdpbicpO1xyXG5cdH1cclxuXHJcblx0YWRqdXN0RGlyZWN0aW9uVG9DdXJyZW50RmlsZSgpIHtcclxuXHRcdGlmICh0aGlzLmN1cnJlbnRGaWxlICYmIHRoaXMuY3VycmVudEZpbGUucGF0aCkge1xyXG5cdFx0XHRsZXQgcmVxdWlyZWREaXJlY3Rpb24gPSBudWxsO1xyXG5cdFx0XHRjb25zdCBmcm9udE1hdHRlckRpcmVjdGlvbiA9IHRoaXMuZ2V0RnJvbnRNYXR0ZXJEaXJlY3Rpb24odGhpcy5jdXJyZW50RmlsZSk7XHJcblx0XHRcdGlmIChmcm9udE1hdHRlckRpcmVjdGlvbikge1xyXG5cdFx0XHRcdGlmIChmcm9udE1hdHRlckRpcmVjdGlvbiA9PSAncnRsJyB8fCBmcm9udE1hdHRlckRpcmVjdGlvbiA9PSAnbHRyJylcclxuXHRcdFx0XHRcdHJlcXVpcmVkRGlyZWN0aW9uID0gZnJvbnRNYXR0ZXJEaXJlY3Rpb247XHJcblx0XHRcdFx0ZWxzZVxyXG5cdFx0XHRcdFx0Y29uc29sZS5sb2coJ0Zyb250IG1hdHRlciBkaXJlY3Rpb24gaW4gZmlsZScsIHRoaXMuY3VycmVudEZpbGUucGF0aCwgJ2lzIHVua25vd246JywgZnJvbnRNYXR0ZXJEaXJlY3Rpb24pO1xyXG5cdFx0XHR9XHJcblx0XHRcdGVsc2UgaWYgKHRoaXMuc2V0dGluZ3MucmVtZW1iZXJQZXJGaWxlICYmIHRoaXMuY3VycmVudEZpbGUucGF0aCBpbiB0aGlzLnNldHRpbmdzLmZpbGVEaXJlY3Rpb25zKSB7XHJcblx0XHRcdFx0Ly8gSWYgdGhlIHVzZXIgd2FudHMgdG8gcmVtZW1iZXIgdGhlIGRpcmVjdGlvbiBwZXIgZmlsZSwgYW5kIHdlIGhhdmUgYSBkaXJlY3Rpb24gc2V0IGZvciB0aGlzIGZpbGUgLS0gdXNlIGl0XHJcblx0XHRcdFx0cmVxdWlyZWREaXJlY3Rpb24gPSB0aGlzLnNldHRpbmdzLmZpbGVEaXJlY3Rpb25zW3RoaXMuY3VycmVudEZpbGUucGF0aF07XHJcblx0XHRcdH0gZWxzZSB7XHJcblx0XHRcdFx0Ly8gVXNlIHRoZSBkZWZhdWx0IGRpcmVjdGlvblxyXG5cdFx0XHRcdHJlcXVpcmVkRGlyZWN0aW9uID0gdGhpcy5zZXR0aW5ncy5kZWZhdWx0RGlyZWN0aW9uO1xyXG5cdFx0XHR9XHJcblx0XHRcdHRoaXMuc2V0RG9jdW1lbnREaXJlY3Rpb24ocmVxdWlyZWREaXJlY3Rpb24pO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0c2F2ZVNldHRpbmdzKCkge1xyXG5cdFx0dmFyIHNldHRpbmdzID0gdGhpcy5zZXR0aW5ncy50b0pzb24oKTtcclxuXHRcdHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIud3JpdGUodGhpcy5TRVRUSU5HU19QQVRILCBzZXR0aW5ncyk7XHJcblx0fVxyXG5cclxuXHRsb2FkU2V0dGluZ3MoKSB7XHJcblx0XHR0aGlzLmFwcC52YXVsdC5hZGFwdGVyLnJlYWQodGhpcy5TRVRUSU5HU19QQVRIKS5cclxuXHRcdFx0dGhlbigoY29udGVudCkgPT4gdGhpcy5zZXR0aW5ncy5mcm9tSnNvbihjb250ZW50KSkuXHJcblx0XHRcdGNhdGNoKGVycm9yID0+IHsgY29uc29sZS5sb2coXCJSVEwgc2V0dGluZ3MgZmlsZSBub3QgZm91bmRcIik7IH0pO1xyXG5cdH1cclxuXHJcblx0Z2V0Q21FZGl0b3IoKTogY29kZW1pcnJvci5FZGl0b3Ige1xyXG5cdFx0bGV0IHZpZXcgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlVmlld09mVHlwZShNYXJrZG93blZpZXcpO1xyXG5cdFx0aWYgKHZpZXcpXHJcblx0XHRcdHJldHVybiB2aWV3LnNvdXJjZU1vZGU/LmNtRWRpdG9yO1xyXG5cdFx0cmV0dXJuIG51bGw7XHJcblx0fVxyXG5cclxuXHRzZXREb2N1bWVudERpcmVjdGlvbihuZXdEaXJlY3Rpb246IHN0cmluZykge1xyXG5cdFx0bGV0IHZpZXcgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlVmlld09mVHlwZShNYXJrZG93blZpZXcpO1xyXG5cdFx0Ly8gU291cmNlIC8gTGl2ZSBWaWV3IGVkaXRvciBkaXJlY3Rpb25cclxuXHRcdGlmICh0aGlzLmVkaXRvck1vZGUgPT09ICdjbTUnKSB7XHJcblx0XHRcdHZhciBjbUVkaXRvciA9IHRoaXMuZ2V0Q21FZGl0b3IoKTtcclxuXHRcdFx0aWYgKGNtRWRpdG9yICYmIGNtRWRpdG9yLmdldE9wdGlvbihcImRpcmVjdGlvblwiKSAhPSBuZXdEaXJlY3Rpb24pIHtcclxuXHRcdFx0XHR0aGlzLnBhdGNoQXV0b0Nsb3NlQnJhY2tldHMoY21FZGl0b3IsIG5ld0RpcmVjdGlvbik7XHJcblx0XHRcdFx0Y21FZGl0b3Iuc2V0T3B0aW9uKFwiZGlyZWN0aW9uXCIsIG5ld0RpcmVjdGlvbiBhcyBhbnkpO1xyXG5cdFx0XHRcdGNtRWRpdG9yLnNldE9wdGlvbihcInJ0bE1vdmVWaXN1YWxseVwiLCB0cnVlKTtcclxuXHRcdFx0fVxyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0aWYgKCF2aWV3LmVkaXRvcilcclxuXHRcdFx0XHRyZXR1cm47XHJcblx0XHRcdHRoaXMucmVwbGFjZVBhZ2VTdHlsZUJ5U3RyaW5nKCdOZXcgZWRpdG9yIGNvbnRlbnQgZGl2JyxcclxuXHRcdFx0XHRgLyogTmV3IGVkaXRvciBjb250ZW50IGRpdiAqLyAuY20tZWRpdG9yIHsgZGlyZWN0aW9uOiAke25ld0RpcmVjdGlvbn07IH1gLCB0cnVlKTtcclxuXHRcdFx0dGhpcy5yZXBsYWNlUGFnZVN0eWxlQnlTdHJpbmcoJ01hcmtkb3duIHByZXZpZXcgUlRMJyxcclxuXHRcdFx0XHRgLyogTWFya2Rvd24gcHJldmlldyBSVEwgKi8gLm1hcmtkb3duLXByZXZpZXctdmlldyB7IGRpcmVjdGlvbjogJHtuZXdEaXJlY3Rpb259OyB9YCwgdHJ1ZSk7XHJcblx0XHRcdHZhciBjb250YWluZXJFbCA9ICh2aWV3LmVkaXRvci5nZXREb2MoKSBhcyBhbnkpPy5jbT8uZG9tPy5wYXJlbnRFbGVtZW50IGFzIEhUTUxEaXZFbGVtZW50O1xyXG5cdFx0XHRpZiAobmV3RGlyZWN0aW9uID09PSAncnRsJykge1xyXG5cdFx0XHRcdGNvbnRhaW5lckVsLmNsYXNzTGlzdC5hZGQoJ2lzLXJ0bCcpO1xyXG5cdFx0XHRcdHRoaXMucmVwbGFjZVBhZ2VTdHlsZUJ5U3RyaW5nKCdMaXN0IGluZGVudCBmaXgnLFxyXG5cdFx0XHRcdFx0YC8qIExpc3QgaW5kZW50IGZpeCAqLyAuY20tcy1vYnNpZGlhbiAuSHlwZXJNRC1saXN0LWxpbmUgeyB0ZXh0LWluZGVudDogMHB4ICFpbXBvcnRhbnQ7IH1gLCB0cnVlKTtcclxuXHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHRjb250YWluZXJFbC5jbGFzc0xpc3QucmVtb3ZlKCdpcy1ydGwnKTtcclxuXHRcdFx0XHR0aGlzLnJlcGxhY2VQYWdlU3R5bGVCeVN0cmluZygnTGlzdCBpbmRlbnQgZml4JyxcclxuXHRcdFx0XHRcdGAvKiBMaXN0IGluZGVudCBmaXggKi8gLyogRW1wdHkgcnVsZSBmb3IgTFRSICovYCwgdHJ1ZSk7XHJcblx0XHRcdH1cclxuXHRcdFx0dGhpcy5yZXBsYWNlUGFnZVN0eWxlQnlTdHJpbmcoJ0VtYmVkZGVkIGxpbmtzIGFsd2F5cyBMVFInLFxyXG5cdFx0XHRcdGAvKiBFbWJlZGRlZCBsaW5rcyBhbHdheXMgTFRSICovIC5lbWJlZGRlZC1iYWNrbGlua3MgeyBkaXJlY3Rpb246IGx0cjsgfWAsIHRydWUpO1xyXG5cdFx0XHR2aWV3LmVkaXRvci5yZWZyZXNoKCk7XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKHZpZXcpIHtcclxuXHRcdFx0Ly8gRml4IHRoZSBsaXN0IGluZGVudGF0aW9uIHN0eWxlXHJcblx0XHRcdHRoaXMucmVwbGFjZVBhZ2VTdHlsZUJ5U3RyaW5nKCdDb2RlTWlycm9yLXJ0bCBwcmUnLFxyXG5cdFx0XHRcdGAuQ29kZU1pcnJvci1ydGwgcHJlIHsgdGV4dC1pbmRlbnQ6IDBweCAhaW1wb3J0YW50OyB9YCxcclxuXHRcdFx0XHR0cnVlKTtcclxuXHJcblx0XHRcdGlmICh0aGlzLnNldHRpbmdzLnNldFlhbWxEaXJlY3Rpb24pIHtcclxuXHRcdFx0XHRjb25zdCBhbGlnblNpZGUgPSBuZXdEaXJlY3Rpb24gPT0gJ3J0bCcgPyAncmlnaHQnIDogJ2xlZnQnO1xyXG5cdFx0XHRcdHRoaXMucmVwbGFjZVBhZ2VTdHlsZUJ5U3RyaW5nKCdQYXRjaCBZQU1MJyxcclxuXHRcdFx0XHRcdGAvKiBQYXRjaCBZQU1MIFJUTCAqLyAubGFuZ3VhZ2UteW1sIGNvZGUgeyB0ZXh0LWFsaWduOiAke2FsaWduU2lkZX07IH1gLCB0cnVlKTtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0aWYgKHRoaXMuc2V0dGluZ3Muc2V0Tm90ZVRpdGxlRGlyZWN0aW9uKSB7XHJcblx0XHRcdFx0dmFyIGxlYWZDb250YWluZXIgPSAodGhpcy5hcHAud29ya3NwYWNlLmFjdGl2ZUxlYWYgYXMgYW55KS5jb250YWluZXJFbCBhcyBEb2N1bWVudDtcclxuXHRcdFx0XHRsZXQgaGVhZGVyID0gbGVhZkNvbnRhaW5lci5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKCd2aWV3LWhlYWRlci10aXRsZS1jb250YWluZXInKTtcclxuXHRcdFx0XHQoaGVhZGVyWzBdIGFzIGFueSkuc3R5bGUuZGlyZWN0aW9uID0gbmV3RGlyZWN0aW9uO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHR0aGlzLnNldEV4cG9ydERpcmVjdGlvbihuZXdEaXJlY3Rpb24pO1xyXG5cdFx0fVxyXG5cclxuXHR9XHJcblxyXG5cdHNldEV4cG9ydERpcmVjdGlvbihuZXdEaXJlY3Rpb246IHN0cmluZykge1xyXG5cdFx0dGhpcy5yZXBsYWNlUGFnZVN0eWxlQnlTdHJpbmcoJ3NlYXJjaGVkIGFuZCByZXBsYWNlZCcsXHJcblx0XHRcdGAvKiBUaGlzIGlzIHNlYXJjaGVkIGFuZCByZXBsYWNlZCBieSB0aGUgcGx1Z2luICovIEBtZWRpYSBwcmludCB7IGJvZHkgeyBkaXJlY3Rpb246ICR7bmV3RGlyZWN0aW9ufTsgfSB9YCxcclxuXHRcdFx0ZmFsc2UpO1xyXG5cdH1cclxuXHJcblx0cmVwbGFjZVBhZ2VTdHlsZUJ5U3RyaW5nKHNlYXJjaFN0cmluZzogc3RyaW5nLCBuZXdTdHlsZTogc3RyaW5nLCBhZGRJZk5vdEZvdW5kOiBib29sZWFuKSB7XHJcblx0XHRsZXQgc3R5bGVzID0gZG9jdW1lbnQuaGVhZC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnc3R5bGUnKTtcclxuXHRcdGxldCBmb3VuZCA9IGZhbHNlO1xyXG5cdFx0Zm9yIChsZXQgc3R5bGUgb2Ygc3R5bGVzKSB7XHJcblx0XHRcdGlmIChzdHlsZS5nZXRUZXh0KCkuaW5jbHVkZXMoc2VhcmNoU3RyaW5nKSkge1xyXG5cdFx0XHRcdHN0eWxlLnNldFRleHQobmV3U3R5bGUpO1xyXG5cdFx0XHRcdGZvdW5kID0gdHJ1ZTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdFx0aWYgKCFmb3VuZCAmJiBhZGRJZk5vdEZvdW5kKSB7XHJcblx0XHRcdGxldCBzdHlsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3N0eWxlJyk7XHJcblx0XHRcdHN0eWxlLnRleHRDb250ZW50ID0gbmV3U3R5bGU7XHJcblx0XHRcdGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0ZmluZFBhZ2VTdHlsZShzZWFyY2hTdHJpbmc6IHN0cmluZykge1xyXG5cdFx0bGV0IHN0eWxlcyA9IGRvY3VtZW50LmhlYWQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ3N0eWxlJyk7XHJcblx0XHRmb3IgKGxldCBzdHlsZSBvZiBzdHlsZXMpIHtcclxuXHRcdFx0aWYgKHN0eWxlLmdldFRleHQoKS5pbmNsdWRlcyhzZWFyY2hTdHJpbmcpKVxyXG5cdFx0XHRcdHJldHVybiB0cnVlO1xyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIGZhbHNlO1xyXG5cdH1cclxuXHJcblx0cGF0Y2hBdXRvQ2xvc2VCcmFja2V0cyhjbUVkaXRvcjogYW55LCBuZXdEaXJlY3Rpb246IHN0cmluZykge1xyXG5cdFx0Ly8gQXV0by1jbG9zZSBicmFja2V0cyBkb2Vzbid0IHdvcmsgaW4gUlRMOiBodHRwczovL2dpdGh1Yi5jb20vZXNtNy9vYnNpZGlhbi1ydGwvaXNzdWVzLzdcclxuXHRcdC8vIFVudGlsIHRoZSBhY3R1YWwgZml4IGlzIHJlbGVhc2VkIChhcyBwYXJ0IG9mIENvZGVNaXJyb3IpLCB3ZSBzdG9yZSB0aGUgdmFsdWUgb2YgYXV0b0Nsb3NlQnJhY2tldHMgd2hlblxyXG5cdFx0Ly8gc3dpdGNoaW5nIHRvIFJUTCwgb3ZlcnJpZGluZyBpdCB0byAnZmFsc2UnIGFuZCByZXN0b3JpbmcgaXQgd2hlbiBiYWNrIHRvIExUUi5cclxuXHRcdGlmIChuZXdEaXJlY3Rpb24gPT0gJ3J0bCcpIHtcclxuXHRcdFx0dGhpcy5hdXRvQ2xvc2VCcmFja2V0c1ZhbHVlID0gY21FZGl0b3IuZ2V0T3B0aW9uKCdhdXRvQ2xvc2VCcmFja2V0cycpO1xyXG5cdFx0XHRjbUVkaXRvci5zZXRPcHRpb24oJ2F1dG9DbG9zZUJyYWNrZXRzJywgZmFsc2UpO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0Y21FZGl0b3Iuc2V0T3B0aW9uKCdhdXRvQ2xvc2VCcmFja2V0cycsIHRoaXMuYXV0b0Nsb3NlQnJhY2tldHNWYWx1ZSk7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHR0b2dnbGVEb2N1bWVudERpcmVjdGlvbigpIHtcclxuXHRcdGxldCBuZXdEaXJlY3Rpb24gPSB0aGlzLmdldERvY3VtZW50RGlyZWN0aW9uKCkgPT09ICdsdHInID8gJ3J0bCcgOiAnbHRyJztcclxuXHRcdHRoaXMuc2V0RG9jdW1lbnREaXJlY3Rpb24obmV3RGlyZWN0aW9uKTtcclxuXHRcdGlmICh0aGlzLnNldHRpbmdzLnJlbWVtYmVyUGVyRmlsZSAmJiB0aGlzLmN1cnJlbnRGaWxlICYmIHRoaXMuY3VycmVudEZpbGUucGF0aCkge1xyXG5cdFx0XHR0aGlzLnNldHRpbmdzLmZpbGVEaXJlY3Rpb25zW3RoaXMuY3VycmVudEZpbGUucGF0aF0gPSBuZXdEaXJlY3Rpb247XHJcblx0XHRcdHRoaXMuc2F2ZVNldHRpbmdzKCk7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHRnZXREb2N1bWVudERpcmVjdGlvbigpIHtcclxuXHRcdGlmICh0aGlzLmVkaXRvck1vZGUgPT09ICdjbTUnKSB7XHJcblx0XHRcdHZhciBjbUVkaXRvciA9IHRoaXMuZ2V0Q21FZGl0b3IoKTtcclxuXHRcdFx0cmV0dXJuIGNtRWRpdG9yPy5nZXRPcHRpb24oJ2RpcmVjdGlvbicpID09PSAncnRsJyA/ICdydGwnIDogJ2x0cic7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHRyZXR1cm4gdGhpcy5maW5kUGFnZVN0eWxlKCdkaXJlY3Rpb246IHJ0bCcpID8gJ3J0bCcgOiAnbHRyJztcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdGdldEZyb250TWF0dGVyRGlyZWN0aW9uKGZpbGU6IFRGaWxlKSB7XHJcblx0XHRjb25zdCBmaWxlQ2FjaGUgPSB0aGlzLmFwcC5tZXRhZGF0YUNhY2hlLmdldEZpbGVDYWNoZShmaWxlKTtcclxuXHRcdGNvbnN0IGZyb250TWF0dGVyID0gZmlsZUNhY2hlPy5mcm9udG1hdHRlcjtcclxuXHRcdGlmIChmcm9udE1hdHRlciAmJiBmcm9udE1hdHRlcj8uZGlyZWN0aW9uKSB7XHJcblx0XHRcdHRyeSB7XHJcblx0XHRcdFx0Y29uc3QgZGlyZWN0aW9uID0gZnJvbnRNYXR0ZXIuZGlyZWN0aW9uO1xyXG5cdFx0XHRcdHJldHVybiBkaXJlY3Rpb247XHJcblx0XHRcdH1cclxuXHRcdFx0Y2F0Y2ggKGVycm9yKSB7fVxyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0c3luY0RlZmF1bHREaXJlY3Rpb24oKSB7XHJcblx0XHQvLyBTeW5jIHRoZSBwbHVnaW4gZGVmYXVsdCBkaXJlY3Rpb24gd2l0aCBPYnNpZGlhbidzIG93biBzZXR0aW5nXHJcblx0XHRjb25zdCBvYnNpZGlhbkRpcmVjdGlvbiA9ICh0aGlzLmFwcC52YXVsdCBhcyBhbnkpLmdldENvbmZpZygncmlnaHRUb0xlZnQnKSA/ICdydGwnIDogJ2x0cic7XHJcblx0XHRpZiAob2JzaWRpYW5EaXJlY3Rpb24gIT0gdGhpcy5zZXR0aW5ncy5kZWZhdWx0RGlyZWN0aW9uKSB7XHJcblx0XHRcdHRoaXMuc2V0dGluZ3MuZGVmYXVsdERpcmVjdGlvbiA9IG9ic2lkaWFuRGlyZWN0aW9uO1xyXG5cdFx0XHR0aGlzLnNhdmVTZXR0aW5ncygpO1xyXG5cdFx0fVxyXG5cdH1cclxufVxyXG5cclxuY2xhc3MgUnRsU2V0dGluZ3NUYWIgZXh0ZW5kcyBQbHVnaW5TZXR0aW5nVGFiIHtcclxuXHRzZXR0aW5nczogU2V0dGluZ3M7XHJcblx0cGx1Z2luOiBSdGxQbHVnaW47XHJcblxyXG5cdGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwbHVnaW46IFJ0bFBsdWdpbikge1xyXG5cdFx0c3VwZXIoYXBwLCBwbHVnaW4pO1xyXG5cdFx0dGhpcy5wbHVnaW4gPSBwbHVnaW47XHJcblx0XHR0aGlzLnNldHRpbmdzID0gcGx1Z2luLnNldHRpbmdzO1xyXG5cdH1cclxuXHJcblx0ZGlzcGxheSgpOiB2b2lkIHtcclxuXHRcdGxldCB7Y29udGFpbmVyRWx9ID0gdGhpcztcclxuXHJcblx0XHRjb250YWluZXJFbC5lbXB0eSgpO1xyXG5cclxuXHRcdGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdoMicsIHt0ZXh0OiAnUlRMIFNldHRpbmdzJ30pO1xyXG5cclxuXHRcdHRoaXMucGx1Z2luLnN5bmNEZWZhdWx0RGlyZWN0aW9uKCk7XHJcblxyXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcblx0XHRcdC5zZXROYW1lKCdSZW1lbWJlciB0ZXh0IGRpcmVjdGlvbiBwZXIgZmlsZScpXHJcblx0XHRcdC5zZXREZXNjKCdTdG9yZSBhbmQgcmVtZW1iZXIgdGhlIHRleHQgZGlyZWN0aW9uIHVzZWQgZm9yIGVhY2ggZmlsZSBpbmRpdmlkdWFsbHkuJylcclxuXHRcdFx0LmFkZFRvZ2dsZSh0b2dnbGUgPT4gdG9nZ2xlLnNldFZhbHVlKHRoaXMuc2V0dGluZ3MucmVtZW1iZXJQZXJGaWxlKVxyXG5cdFx0XHRcdFx0ICAgLm9uQ2hhbmdlKCh2YWx1ZSkgPT4ge1xyXG5cdFx0XHRcdFx0XHQgICB0aGlzLnNldHRpbmdzLnJlbWVtYmVyUGVyRmlsZSA9IHZhbHVlO1xyXG5cdFx0XHRcdFx0XHQgICB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuXHRcdFx0XHRcdFx0ICAgdGhpcy5wbHVnaW4uYWRqdXN0RGlyZWN0aW9uVG9DdXJyZW50RmlsZSgpO1xyXG5cdFx0XHRcdFx0ICAgfSkpO1xyXG5cclxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG5cdFx0XHQuc2V0TmFtZSgnRGVmYXVsdCB0ZXh0IGRpcmVjdGlvbicpXHJcblx0XHRcdC5zZXREZXNjKCdXaGF0IHNob3VsZCBiZSB0aGUgZGVmYXVsdCB0ZXh0IGRpcmVjdGlvbiBpbiBPYnNpZGlhbj8nKVxyXG5cdFx0XHQuYWRkRHJvcGRvd24oZHJvcGRvd24gPT4gZHJvcGRvd24uYWRkT3B0aW9uKCdsdHInLCAnTFRSJylcclxuXHRcdFx0XHRcdFx0IC5hZGRPcHRpb24oJ3J0bCcsICdSVEwnKVxyXG5cdFx0XHRcdFx0XHQgLnNldFZhbHVlKHRoaXMuc2V0dGluZ3MuZGVmYXVsdERpcmVjdGlvbilcclxuXHRcdFx0XHRcdFx0IC5vbkNoYW5nZSgodmFsdWUpID0+IHtcclxuXHRcdFx0XHRcdFx0XHQgdGhpcy5zZXR0aW5ncy5kZWZhdWx0RGlyZWN0aW9uID0gdmFsdWU7XHJcblx0XHRcdFx0XHRcdFx0ICh0aGlzLmFwcC52YXVsdCBhcyBhbnkpLnNldENvbmZpZygncmlnaHRUb0xlZnQnLCB2YWx1ZSA9PSAncnRsJyk7XHJcblx0XHRcdFx0XHRcdFx0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cdFx0XHRcdFx0XHRcdCB0aGlzLnBsdWdpbi5hZGp1c3REaXJlY3Rpb25Ub0N1cnJlbnRGaWxlKCk7XHJcblx0XHRcdFx0XHRcdCB9KSk7XHJcblxyXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcblx0XHRcdC5zZXROYW1lKCdTZXQgbm90ZSB0aXRsZSBkaXJlY3Rpb24nKVxyXG5cdFx0XHQuc2V0RGVzYygnSW4gUlRMIG5vdGVzLCBhbHNvIHNldCB0aGUgZGlyZWN0aW9uIG9mIHRoZSBub3RlIHRpdGxlLicpXHJcblx0XHRcdC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZS5zZXRWYWx1ZSh0aGlzLnNldHRpbmdzLnNldE5vdGVUaXRsZURpcmVjdGlvbilcclxuXHRcdFx0XHRcdFx0IC5vbkNoYW5nZSgodmFsdWUpID0+IHtcclxuXHRcdFx0XHRcdFx0XHQgdGhpcy5zZXR0aW5ncy5zZXROb3RlVGl0bGVEaXJlY3Rpb24gPSB2YWx1ZTtcclxuXHRcdFx0XHRcdFx0XHQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcblx0XHRcdFx0XHRcdFx0IHRoaXMucGx1Z2luLmFkanVzdERpcmVjdGlvblRvQ3VycmVudEZpbGUoKTtcclxuXHRcdFx0XHRcdFx0IH0pKTtcclxuXHJcblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuXHRcdFx0LnNldE5hbWUoJ1NldCBZQU1MIGRpcmVjdGlvbiBpbiBQcmV2aWV3JylcclxuXHRcdFx0LnNldERlc2MoJ0ZvciBSVEwgbm90ZXMsIHByZXZpZXcgWUFNTCBibG9ja3MgYXMgUlRMLiAoV2hlbiB0dXJuaW5nIG9mZiwgcmVzdGFydCBvZiBPYnNpZGlhbiBpcyByZXF1aXJlZC4pJylcclxuXHRcdFx0LmFkZFRvZ2dsZSh0b2dnbGUgPT4gdG9nZ2xlLnNldFZhbHVlKHRoaXMuc2V0dGluZ3Muc2V0WWFtbERpcmVjdGlvbiA/PyBmYWxzZSlcclxuXHRcdFx0XHRcdFx0IC5vbkNoYW5nZSgodmFsdWUpID0+IHtcclxuXHRcdFx0XHRcdFx0XHQgdGhpcy5zZXR0aW5ncy5zZXRZYW1sRGlyZWN0aW9uID0gdmFsdWU7XHJcblx0XHRcdFx0XHRcdFx0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cdFx0XHRcdFx0XHRcdCB0aGlzLnBsdWdpbi5hZGp1c3REaXJlY3Rpb25Ub0N1cnJlbnRGaWxlKCk7XHJcblx0XHRcdFx0XHRcdCB9KSk7XHJcblx0fVxyXG59XHJcbiJdLCJuYW1lcyI6WyJQbHVnaW4iLCJNYXJrZG93blZpZXciLCJQbHVnaW5TZXR0aW5nVGFiIiwiU2V0dGluZyJdLCJtYXBwaW5ncyI6Ijs7OztBQUdBLE1BQU0sUUFBUTtJQUFkO1FBQ1EsbUJBQWMsR0FBK0IsRUFBRSxDQUFDO1FBQ2hELHFCQUFnQixHQUFXLEtBQUssQ0FBQztRQUNqQyxvQkFBZSxHQUFZLElBQUksQ0FBQztRQUNoQywwQkFBcUIsR0FBWSxJQUFJLENBQUM7UUFDdEMscUJBQWdCLEdBQVksS0FBSyxDQUFDO0tBYXpDO0lBWEEsTUFBTTtRQUNMLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztLQUM1QjtJQUVELFFBQVEsQ0FBQyxPQUFlO1FBQ3ZCLElBQUksR0FBRyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDOUIsSUFBSSxDQUFDLGNBQWMsR0FBRyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUM1QyxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsR0FBRyxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFDaEQsSUFBSSxDQUFDLGVBQWUsR0FBRyxHQUFHLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUM5QyxJQUFJLENBQUMscUJBQXFCLEdBQUcsR0FBRyxDQUFDLHVCQUF1QixDQUFDLENBQUM7S0FDMUQ7Q0FDRDtNQUVvQixTQUFVLFNBQVFBLGVBQU07SUFBN0M7O1FBRVEsYUFBUSxHQUFHLElBQUksUUFBUSxFQUFFLENBQUM7UUFFMUIsa0JBQWEsR0FBRyxvQkFBb0IsQ0FBQTtRQUNuQyxlQUFVLEdBQWtCLElBQUksQ0FBQzs7O1FBR2pDLDJC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
