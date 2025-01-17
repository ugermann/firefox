/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["NetErrorChild"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const { ActorChild } = ChromeUtils.import(
  "resource://gre/modules/ActorChild.jsm"
);

XPCOMUtils.defineLazyGetter(this, "gPipNSSBundle", function() {
  return Services.strings.createBundle(
    "chrome://pipnss/locale/pipnss.properties"
  );
});
XPCOMUtils.defineLazyGetter(this, "gNSSErrorsBundle", function() {
  return Services.strings.createBundle(
    "chrome://pipnss/locale/nsserrors.properties"
  );
});

const SEC_ERROR_BASE = Ci.nsINSSErrorsService.NSS_SEC_ERROR_BASE;
const SEC_ERROR_REUSED_ISSUER_AND_SERIAL = SEC_ERROR_BASE + 138;

const SSL_ERROR_BASE = Ci.nsINSSErrorsService.NSS_SSL_ERROR_BASE;
const SSL_ERROR_SSL_DISABLED = SSL_ERROR_BASE + 20;
const SSL_ERROR_SSL2_DISABLED = SSL_ERROR_BASE + 14;

const PREF_SSL_IMPACT_ROOTS = ["security.tls.version.", "security.ssl3."];

function getSerializedSecurityInfo(docShell) {
  let serhelper = Cc["@mozilla.org/network/serialization-helper;1"].getService(
    Ci.nsISerializationHelper
  );

  let securityInfo =
    docShell.failedChannel && docShell.failedChannel.securityInfo;
  if (!securityInfo) {
    return "";
  }
  securityInfo
    .QueryInterface(Ci.nsITransportSecurityInfo)
    .QueryInterface(Ci.nsISerializable);

  return serhelper.serializeToString(securityInfo);
}

class NetErrorChild extends ActorChild {
  isAboutNetError(doc) {
    return doc.documentURI.startsWith("about:neterror");
  }

  handleEvent(aEvent) {
    // Documents have a null ownerDocument.
    let doc = aEvent.originalTarget.ownerDocument || aEvent.originalTarget;

    switch (aEvent.type) {
      case "AboutNetErrorLoad":
        this.onPageLoad(doc.defaultView);
        break;
      case "AboutNetErrorSetAutomatic":
        this.onSetAutomatic(aEvent);
        break;
      case "AboutNetErrorResetPreferences":
        this.onResetPreferences(aEvent);
        break;
      case "click":
        let elem = aEvent.originalTarget;
        if (
          elem.id == "viewCertificate" ||
          elem.id == "exceptionDialogButton"
        ) {
          this.mm.sendAsyncMessage("Browser:CertExceptionError", {
            location: doc.location.href,
            elementId: elem.id,
            securityInfoAsString: getSerializedSecurityInfo(
              doc.defaultView.docShell
            ),
          });
        }
        break;
    }
  }

  changedCertPrefs() {
    let prefSSLImpact = PREF_SSL_IMPACT_ROOTS.reduce((prefs, root) => {
      return prefs.concat(Services.prefs.getChildList(root));
    }, []);
    for (let prefName of prefSSLImpact) {
      if (Services.prefs.prefHasUserValue(prefName)) {
        return true;
      }
    }

    return false;
  }

  _getErrorMessageFromCode(securityInfo, doc) {
    let uri = Services.io.newURI(doc.location);
    let hostString = uri.host;
    if (uri.port != 443 && uri.port != -1) {
      hostString = uri.hostPort;
    }

    let id_str = "";
    switch (securityInfo.errorCode) {
      case SSL_ERROR_SSL_DISABLED:
        id_str = "PSMERR_SSL_Disabled";
        break;
      case SSL_ERROR_SSL2_DISABLED:
        id_str = "PSMERR_SSL2_Disabled";
        break;
      case SEC_ERROR_REUSED_ISSUER_AND_SERIAL:
        id_str = "PSMERR_HostReusedIssuerSerial";
        break;
    }
    let nss_error_id_str = securityInfo.errorCodeString;
    let msg2 = "";
    try {
      if (id_str) {
        msg2 = gPipNSSBundle.GetStringFromName(id_str) + "\n";
      } else if (nss_error_id_str) {
        msg2 = gNSSErrorsBundle.GetStringFromName(nss_error_id_str) + "\n";
      }
    } catch (e) {
      msg2 = "";
    }

    if (!msg2) {
      // We couldn't get an error message. Use the error string.
      // Note that this is different from before where we used PR_ErrorToString.
      msg2 = nss_error_id_str;
    }
    let msg = gPipNSSBundle.formatStringFromName("SSLConnectionErrorPrefix2", [
      hostString,
      msg2,
    ]);

    if (nss_error_id_str && msg2 != nss_error_id_str) {
      msg +=
        gPipNSSBundle.formatStringFromName("certErrorCodePrefix3", [
          nss_error_id_str,
        ]) + "\n";
    }
    return msg;
  }

  onPageLoad(win) {
    // Values for telemtery bins: see TLS_ERROR_REPORT_UI in Histograms.json
    const TLS_ERROR_REPORT_TELEMETRY_UI_SHOWN = 0;

    if (this.isAboutNetError(win.document)) {
      let docShell = win.docShell;
      if (docShell) {
        let { securityInfo } = docShell.failedChannel;
        // We don't have a securityInfo when this is for example a DNS error.
        if (securityInfo) {
          securityInfo.QueryInterface(Ci.nsITransportSecurityInfo);
          let msg = this._getErrorMessageFromCode(securityInfo, win.document);
          let id = win.document.getElementById("errorShortDescText");
          id.textContent = msg;
        }
      }

      let learnMoreLink = win.document.getElementById("learnMoreLink");
      let baseURL = Services.urlFormatter.formatURLPref("app.support.baseURL");
      learnMoreLink.setAttribute("href", baseURL + "connection-not-secure");

      let automatic = Services.prefs.getBoolPref(
        "security.ssl.errorReporting.automatic"
      );
      win.dispatchEvent(
        new win.CustomEvent("AboutNetErrorOptions", {
          detail: JSON.stringify({
            enabled: Services.prefs.getBoolPref(
              "security.ssl.errorReporting.enabled"
            ),
            changedCertPrefs: this.changedCertPrefs(),
            automatic,
          }),
        })
      );

      this.mm.sendAsyncMessage("Browser:SSLErrorReportTelemetry", {
        reportStatus: TLS_ERROR_REPORT_TELEMETRY_UI_SHOWN,
      });
    }
  }

  onResetPreferences(evt) {
    this.mm.sendAsyncMessage("Browser:ResetSSLPreferences");
  }

  onSetAutomatic(evt) {
    this.mm.sendAsyncMessage("Browser:SetSSLErrorReportAuto", {
      automatic: evt.detail,
    });

    // If we're enabling reports, send a report for this failure.
    if (evt.detail) {
      let win = evt.originalTarget.ownerGlobal;
      let docShell = win.docShell;

      let { securityInfo } = docShell.failedChannel;
      securityInfo.QueryInterface(Ci.nsITransportSecurityInfo);
      let { host, port } = win.document.mozDocumentURIIfNotForErrorPages;

      let errorReporter = Cc["@mozilla.org/securityreporter;1"].getService(
        Ci.nsISecurityReporter
      );
      errorReporter.reportTLSError(securityInfo, host, port);
    }
  }
}
