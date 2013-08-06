suite('latex', function() {
  function assertParsesLatex(str, latex) {
    if (arguments.length < 2) latex = str;

    var result = latexMathParser.parse(str).join('latex');
    assert.equal(result, latex,
      'parsing \''+str+'\', got \''+result+'\', expected \''+latex+'\''
    );
  }

  test('variables', function() {
    assertParsesLatex('xyz');
  });

  test('simple exponent', function() {
    assertParsesLatex('x^n');
  });

  test('block exponent', function() {
    assertParsesLatex('x^{n}', 'x^n');
    assertParsesLatex('x^{nm}');
    assertParsesLatex('x^{}', 'x^{ }');
  });

  test('nested exponents', function() {
    assertParsesLatex('x^{n^m}');
  });

  test('exponents with spaces', function() {
    assertParsesLatex('x^ 2', 'x^2');

    assertParsesLatex('x ^2', 'x^2');
  });

  test('inner groups', function() {
    assertParsesLatex('a{bc}d', 'abcd');
    assertParsesLatex('{bc}d', 'bcd');
    assertParsesLatex('a{bc}', 'abc');
    assertParsesLatex('{bc}', 'bc');

    assertParsesLatex('x^{a{bc}d}', 'x^{abcd}');
    assertParsesLatex('x^{a{bc}}', 'x^{abc}');
    assertParsesLatex('x^{{bc}}', 'x^{bc}');
    assertParsesLatex('x^{{bc}d}', 'x^{bcd}');

    assertParsesLatex('{asdf{asdf{asdf}asdf}asdf}', 'asdfasdfasdfasdfasdf');
  });

  test('commands without braces', function() {
    assertParsesLatex('\\frac12', '\\frac{1}{2}');
    assertParsesLatex('\\frac1a', '\\frac{1}{a}');
    assertParsesLatex('\\frac ab', '\\frac{a}{b}');

    assertParsesLatex('\\frac a b', '\\frac{a}{b}');
    assertParsesLatex(' \\frac a b ', '\\frac{a}{b}');
    assertParsesLatex('\\frac{1} 2', '\\frac{1}{2}');
    assertParsesLatex('\\frac{ 1 } 2', '\\frac{1}{2}');

    assert.throws(function() { latexMathParser.parse('\\frac'); });
  });

  test('whitespace', function() {
    assertParsesLatex('  a + b ', 'a+b');
    assertParsesLatex('       ', '');
    assertParsesLatex('', '');
  });

  test('parens', function() {
    var tree = latexMathParser.parse('\\left(123\\right)');

    assert.ok(tree.firstChild instanceof Bracket);
    var contents = tree.firstChild.firstChild.join('latex');
    assert.equal(contents, '123');
    assert.equal(tree.join('latex'), '\\left(123\\right)');
  });

  test('parens with whitespace', function() {
    assertParsesLatex('\\left ( 123 \\right ) ', '\\left(123\\right)');
  });

  test('\\text', function() {
    assertParsesLatex('\\text { lol! } ', '\\text{ lol! }');
    assertParsesLatex('\\text{apples} \\ne \\text{oranges}',
                      '\\text{apples}\\ne \\text{oranges}');
  });

  suite('RootMathBlock::renderLatex', function() {
    var el;
    setup(function() {
      el = $('<span></span>').appendTo('#mock').mathquill('editable');
    });
    teardown(function() {
      el.remove();
    });

    test('basic rendering', function() {
      el.mathquill('latex', 'x = \\frac{ -b \\pm \\sqrt{ b^2 - 4ac } }{ 2a }');
      assert.equal(el.mathquill('latex'), 'x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}');
    });

    test('re-rendering', function() {
      el.mathquill('latex', 'a x^2 + b x + c = 0');
      assert.equal(el.mathquill('latex'), 'ax^2+bx+c=0');
      el.mathquill('latex', 'x = \\frac{ -b \\pm \\sqrt{ b^2 - 4ac } }{ 2a }');
      assert.equal(el.mathquill('latex'), 'x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}');
    });

    test('normalizes _^', function() {
      el.mathquill('latex', 'x_1^2');
      assert.equal(el.mathquill('latex'), 'x_1^2');
      el.mathquill('latex', 'x^2_1');
      assert.equal(el.mathquill('latex'), 'x_1^2');

      el.mathquill('latex', '\\left(stuff\\right)_{omg}^{lol}');
      assert.equal(el.mathquill('latex'), '\\left(stuff\\right)_{omg}^{lol}');
      el.mathquill('latex', '\\left(stuff\\right)^{lol}_{omg}');
      assert.equal(el.mathquill('latex'), '\\left(stuff\\right)_{omg}^{lol}');
    });

    suite('Cursor::writeLatex \\sum', function() {
      test('basic', function() {
        el.mathquill('write', '\\sum_{n=0}^5');
        assert.equal(el.mathquill('latex'), '\\sum_{n=0}^5');
        el.mathquill('write', 'x^n');
        assert.equal(el.mathquill('latex'), '\\sum_{n=0}^5x^n');
      });

      test('only lower bound', function() {
        el.mathquill('write', '\\sum_{n=0}');
        assert.equal(el.mathquill('latex'), '\\sum_{n=0}');
        el.mathquill('write', '^5');
        assert.equal(el.mathquill('latex'), '\\sum_{n=0}^5');
        el.mathquill('write', 'x^n');
        assert.equal(el.mathquill('latex'), '\\sum_{n=0}^5x^n');
      });

      test('only upper bound', function() {
        el.mathquill('write', '\\sum^5');
        assert.equal(el.mathquill('latex'), '\\sum^5');
        el.mathquill('write', '_{n=0}');
        assert.equal(el.mathquill('latex'), '\\sum_{n=0}^5');
        el.mathquill('write', 'x^n');
        assert.equal(el.mathquill('latex'), '\\sum_{n=0}^5x^n');
      });
    });
  });

  suite('RootMathBlock::renderSliderLatex', function() {
    var el;
    setup(function() {
      el = $('<span></span>').appendTo('#mock').mathquill('editable');
    });
    teardown(function() {
      el.remove();
    });

    test('basic rendering', function() {
      el.mathquill('sliderLatex', 'y=6.8');
      assert.equal(el.mathquill('latex'), 'y=6.8');

      el.mathquill('sliderLatex', 'y=-1');
      assert.equal(el.mathquill('latex'), 'y=-1');
    });

    test('subscripts', function() {
      el.mathquill('sliderLatex', 'x_0=0.1');
      assert.equal(el.mathquill('latex'), 'x_0=0.1');

      el.mathquill('sliderLatex', 'x_{pi}=3.14');
      assert.equal(el.mathquill('latex'), 'x_{pi}=3.14');
    });

    test('error checking', function() {
      assert.throws(function() { el.mathquill('sliderLatex', ''); });
      assert.throws(function() { el.mathquill('sliderLatex', 'x'); });
      assert.throws(function() { el.mathquill('sliderLatex', 'x='); });
      assert.throws(function() { el.mathquill('sliderLatex', 'x_=0.1'); });
      assert.throws(function() { el.mathquill('sliderLatex', 'x_{uh=0.1'); });
      assert.throws(function() { el.mathquill('sliderLatex', 'x_{uh, what?}=0.1'); });
      assert.throws(function() { el.mathquill('sliderLatex', 'x_abc=0.1'); });
      assert.throws(function() { el.mathquill('sliderLatex', 'xy_i=0.1'); });
    });
  });

  suite('error handling', function() {
    var el;
    setup(function() {
      el = $('<span></span>').appendTo('#mock').mathquill('editable');
    });
    teardown(function() {
      el.remove();
    });

    function testCantParse(title /*, latex...*/) {
      var latex = [].slice.call(arguments, 1);
      test(title, function() {
        for (var i = 0; i < latex.length; i += 1) {
          el.mathquill('latex', latex[i]);
          assert.equal(el.mathquill('latex'), '', "shouldn\'t parse '"+latex[i]+"'");
        }
      });
    }

    testCantParse('missing blocks', '\\frac', '\\sqrt', '^', '_');
    testCantParse('unmatched close brace', '}', ' 1 + 2 } ', '1 - {2 + 3} }', '\\sqrt{ x }} + \\sqrt{y}');
    testCantParse('unmatched open brace', '{', '1 * { 2 + 3', '\\frac{ \\sqrt x }{{ \\sqrt y}');
    testCantParse('unmatched \\left/\\right', '\\left ( 1 + 2 )', ' [ 1, 2 \\right ]');
  });
});
