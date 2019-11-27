import { CipherService } from 'jslib/abstractions/cipher.service';
import { LockService } from 'jslib/abstractions/lock.service';
import { PlatformUtilsService } from 'jslib/abstractions/platformUtils.service';

export default class WebRequestBackground {
    private pendingAuthRequests: any[] = [];
    private webRequest: any;
    private webNavigation: any;
    private isFirefox: boolean;

    constructor(platformUtilsService: PlatformUtilsService, private cipherService: CipherService,
        private lockService: LockService) {
        this.webRequest = (window as any).chrome.webRequest;
        this.webNavigation = (window as any).chrome.webNavigation;
        this.isFirefox = platformUtilsService.isFirefox();
    }

    async init() {
        this.webRequest.onCompleted.addListener(async (e: any) => {
            const isNotificationEnabled = false;
            if (isNotificationEnabled && e.tabId > 0) {
                await chrome.tabs.executeScript(e.tabId, {
                    runAt: 'document_start', allFrames: true,
                    file: 'content/autofill.js'
                });
                await chrome.tabs.executeScript(e.tabId, {
                    runAt: 'document_start', allFrames: true,
                    file: 'content/autofiller.js'
                });
                await chrome.tabs.executeScript(e.tabId, {
                    runAt: 'document_start', allFrames: true,
                    file: 'content/notificationBar.js'
                });
                await chrome.tabs.executeScript(e.tabId, {
                    runAt: 'document_start', allFrames: false,
                    file: 'content/shortcuts.js'
                });
            }
        }, { urls: ['http://*/*', 'https://*/*', 'file:///*'] }); console.log('2');
        if (!this.webRequest || !this.webRequest.onAuthRequired) {
            return;
        }
        this.webRequest.onAuthRequired.addListener(async (details: any, callback: any) => {
            if (!details.url || this.pendingAuthRequests.indexOf(details.requestId) !== -1) {
                if (callback) {
                    callback();
                }
                return;
            }

            this.pendingAuthRequests.push(details.requestId);

            if (this.isFirefox) {
                return new Promise(async (resolve, reject) => {
                    await this.resolveAuthCredentials(details.url, resolve, reject);
                });
            } else {
                await this.resolveAuthCredentials(details.url, callback, callback);
            }
        }, { urls: ['http://*/*', 'https://*/*'] }, [this.isFirefox ? 'blocking' : 'asyncBlocking']);

        this.webRequest.onCompleted.addListener(
            (details: any) => this.completeAuthRequest(details), { urls: ['http://*/*'] });
        this.webRequest.onErrorOccurred.addListener(
            (details: any) => this.completeAuthRequest(details), { urls: ['http://*/*'] });
    }

    private async resolveAuthCredentials(domain: string, success: Function, error: Function) {
        if (await this.lockService.isLocked()) {
            error();
            return;
        }

        try {
            const ciphers = await this.cipherService.getAllDecryptedForUrl(domain);
            if (ciphers == null || ciphers.length !== 1) {
                error();
                return;
            }

            success({
                authCredentials: {
                    username: ciphers[0].login.username,
                    password: ciphers[0].login.password,
                },
            });
        } catch {
            error();
        }
    }

    private completeAuthRequest(details: any) {
        const i = this.pendingAuthRequests.indexOf(details.requestId);
        if (i > -1) {
            this.pendingAuthRequests.splice(i, 1);
        }
    }
}
