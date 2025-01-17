/* -*- Mode: IDL; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * The origin of this IDL file is
 * https://webaudio.github.io/web-audio-api/
 *
 * Copyright © 2012 W3C® (MIT, ERCIM, Keio), All Rights Reserved. W3C
 * liability, trademark and document use rules apply.
 */

enum ChannelCountMode {
    "max",
    "clamped-max",
    "explicit"
};

enum ChannelInterpretation {
    "speakers",
    "discrete"
};

dictionary AudioNodeOptions {
             unsigned long         channelCount;
             ChannelCountMode      channelCountMode;
             ChannelInterpretation channelInterpretation;
};

[Pref="dom.webaudio.enabled"]
interface AudioNode : EventTarget {

    [Throws]
    AudioNode connect(AudioNode destination, optional unsigned long output = 0, optional unsigned long input = 0);
    [Throws]
    void connect(AudioParam destination, optional unsigned long output = 0);
    [Throws]
    void disconnect();
    [Throws]
    void disconnect(unsigned long output);
    [Throws]
    void disconnect(AudioNode destination);
    [Throws]
    void disconnect(AudioNode destination, unsigned long output);
    [Throws]
    void disconnect(AudioNode destination, unsigned long output, unsigned long input);
    [Throws]
    void disconnect(AudioParam destination);
    [Throws]
    void disconnect(AudioParam destination, unsigned long output);

    readonly attribute BaseAudioContext context;
    readonly attribute unsigned long numberOfInputs;
    readonly attribute unsigned long numberOfOutputs;

    // Channel up-mixing and down-mixing rules for all inputs.
    [SetterThrows]
    attribute unsigned long channelCount;
    [SetterThrows, BinaryName="channelCountModeValue"]
    attribute ChannelCountMode channelCountMode;
    [SetterThrows, BinaryName="channelInterpretationValue"]
    attribute ChannelInterpretation channelInterpretation;

};

// Mozilla extension
partial interface AudioNode {
  [ChromeOnly]
  readonly attribute unsigned long id;
};
[NoInterfaceObject]
interface AudioNodePassThrough {
  [ChromeOnly]
  attribute boolean passThrough;
};

