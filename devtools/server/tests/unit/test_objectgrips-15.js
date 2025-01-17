/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Test out of scope objects with async functions.
 */

var gDebuggee;
var gClient;
var gThreadFront;

function run_test() {
  initTestDebuggerServer();
  gDebuggee = addTestGlobal("test-object-grip");
  gClient = new DebuggerClient(DebuggerServer.connectPipe());
  gClient.connect().then(function() {
    attachTestTabAndResume(gClient, "test-object-grip", function(
      response,
      targetFront,
      threadFront
    ) {
      gThreadFront = threadFront;
      testObjectGroup();
    });
  });
  do_test_pending();
}

function evalCode() {
  evalCallback(gDebuggee, function runTest() {
    const ugh = [];
    let i = 0;

    function foo() {
      ugh.push(i++);
      debugger;
    }

    Promise.resolve()
      .then(foo)
      .then(foo);
  });
}

const testObjectGroup = async function() {
  let packet = await executeOnNextTickAndWaitForPause(evalCode, gThreadFront);

  const ugh = packet.frame.environment.parent.bindings.variables.ugh;
  const ughClient = await gThreadFront.pauseGrip(ugh.value);

  packet = await getPrototypeAndProperties(ughClient);

  packet = await resumeAndWaitForPause(gThreadFront);
  const ugh2 = packet.frame.environment.parent.bindings.variables.ugh;
  const ugh2Client = gThreadFront.pauseGrip(ugh2.value);

  packet = await getPrototypeAndProperties(ugh2Client);
  Assert.equal(packet.ownProperties.length.value, 2);

  await resume(gThreadFront);
  finishClient(gClient);
};
