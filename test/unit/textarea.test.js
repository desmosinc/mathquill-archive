suite('key', function() {
  var textarea;
  var spanarea;
  var Event = $.Event

  function shouldNotBeCalled() {
    assert.ok(false, 'this function should not be called');
  }

  function supportsSelectionAPI() {
    return 'selectionStart' in textarea[0];
  }

  setup(function() {
    textarea = $('<textarea>').appendTo('#mock');
    spanarea = $('<span>').appendTo('#mock');
  });

  teardown(function() {
    textarea.remove();
    spanarea.remove(); 
  });

  test('normal keys', function(done) {
    var counter = 0;
    manageTextarea(textarea, spanarea, {
      text: function(text, keydown, keypress) {
        counter += 1;
        assert.ok(counter <= 1, 'callback is only called once');
        assert.equal(text, 'a', 'text comes back as a');
        assert.equal(textarea.val(), '', 'the textarea remains empty');

        done();
      },
    });

    textarea.trigger(Event('keydown', { which: 97 }));
    textarea.trigger(Event('keypress', { which: 97 }));
    textarea.val('a');
  });

  test('one keydown only', function(done) {
    var counter = 0;

    manageTextarea(textarea, spanarea, {
      key: function(key, evt) {
        counter += 1;
        assert.ok(counter <= 1, 'callback is called only once');
        assert.equal(key, 'Backspace', 'key is correctly set');

        done();
      },
      text: shouldNotBeCalled
    });

    textarea.trigger(Event('keydown', { which: 8 }));
  });

  test('a series of keydowns only', function(done) {
    var counter = 0;

    manageTextarea(textarea, spanarea, {
      key: function(key, keydown) {
        counter += 1;
        assert.ok(counter <= 3, 'callback is called at most 3 times');

        assert.ok(keydown);
        assert.equal(key, 'Left');

        if (counter === 3) done();
      },
      text: shouldNotBeCalled
    });

    textarea.trigger(Event('keydown', { which: 37 }));
    textarea.trigger(Event('keydown', { which: 37 }));
    textarea.trigger(Event('keydown', { which: 37 }));
  });

  test('one keydown and a series of keypresses', function(done) {
    var counter = 0;

    manageTextarea(textarea, spanarea, {
      key: function(key, keydown) {
        counter += 1;
        assert.ok(counter <= 3, 'callback is called at most 3 times');

        assert.ok(keydown);
        assert.equal(key, 'Backspace');

        if (counter === 3) done();
      },
      text: shouldNotBeCalled
    });

    textarea.trigger(Event('keydown', { which: 8 }));
    textarea.trigger(Event('keypress', { which: 8 }));
    textarea.trigger(Event('keypress', { which: 8 }));
    textarea.trigger(Event('keypress', { which: 8 }));
  });

  suite('select', function() {
    test('select populates the textarea but doesn\'t call text', function() {
      var manager = manageTextarea(textarea, spanarea, {
        text: shouldNotBeCalled,
      });

      manager.select('foobar');

      assert.equal(textarea.val(), 'foobar');
      textarea.trigger('keydown');
      assert.equal(textarea.val(), 'foobar', 'value remains after keydown');

      if (supportsSelectionAPI()) {
        textarea.trigger('keypress');
        assert.equal(textarea.val(), 'foobar', 'value remains after keypress');
        textarea.trigger('input');
        assert.equaltextarea.val(), 'foobar', 'value remains after flush after keypress');
      }
    });

    test('select populates the textarea but doesn\'t call text' +
         ' on keydown, even when the selection is not properly' +
         ' detectable', function() {
      var manager = manageTextarea(textarea, spanarea, { text: shouldNotBeCalled });

      manager.select('foobar');
      // monkey-patch the dom-level selection so that hasSelection()
      // returns false, as in IE < 9.
      textarea[0].selectionStart = textarea[0].selectionEnd = 0;

      textarea.trigger('keydown');
      assert.equal(textarea.val(), 'foobar', 'value remains after keydown');
    });

    test('blurring', function() {
      var manager = manageTextarea(textarea, spanarea, {
        text: shouldNotBeCalled,
      });

      manager.select('foobar');
      textarea.trigger('blur');
      textarea.focus();

      // IE < 9 doesn't support selection{Start,End}
      if (supportsSelectionAPI()) {
        assert.equal(textarea[0].selectionStart, 0, 'it\'s selected from the start');
        assert.equal(textarea[0].selectionEnd, 6, 'it\'s selected to the end');
      }

      assert.equal(textarea.val(), 'foobar', 'it still has content');
    });
  });

  suite('paste', function() {
    test('paste event only', function(done) {
      manageTextarea(textarea, spanarea, {
        text: shouldNotBeCalled,
        paste: function(text) {
          assert.equal(text, '$x^2+1$');

          done();
        }
      });

      textarea.trigger('paste');
      textarea.val('$x^2+1$');
    });

    test('paste after keydown/keypress', function(done) {
      manageTextarea(textarea, spanarea, {
        text: shouldNotBeCalled,
        paste: function(text) {
          assert.equal(text, 'foobar');
          done();
        }
      });

      // somebody presses Ctrl-V
      textarea.trigger('keydown', { which: 86, ctrlKey: true });
      textarea.trigger('keypress', { which: 118, ctrlKey: true });
      textarea.trigger('paste');
      textarea.val('foobar');
    });

    test('keypress timeout happening before paste timeout', function(done) {
      manageTextarea(textarea, spanarea, {
        text: shouldNotBeCalled,
        paste: function(text) {
          assert.equal(text, 'foobar');
          done();
        }
      });

      textarea.trigger('keydown', { which: 86, ctrlKey: true });
      textarea.trigger('keypress', { which: 118, ctrlKey: true });
      textarea.trigger('paste');
      textarea.val('foobar');

      // this synthesizes the keypress timeout calling handleText()
      // before the paste timeout happens.
      textarea.trigger('input');
    });
  });
});
