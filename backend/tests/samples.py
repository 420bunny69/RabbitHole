"""Sample data shared by several test files."""

ARTICLE_HTML = b"""<html><head><title>Understanding Gradient Descent | Example Blog</title></head><body>
<nav><a href="/">Home</a><a href="/about">About us</a></nav>
<article><h1>Understanding Gradient Descent</h1>
<p>Gradient descent is an optimization algorithm used to minimize a function by iteratively moving
in the direction of steepest descent. It is the backbone of training for most machine learning
models, from linear regression to deep neural networks.</p>
<p>The learning rate controls how large each step is. Too large and the algorithm overshoots the
minimum; too small and training takes forever to converge on a good solution.</p>
</article><footer>Copyright 2026 Example Blog</footer></body></html>"""

EMPTY_PAGE_HTML = b"<html><head><title>Hi</title></head><body><p>Short.</p></body></html>"
