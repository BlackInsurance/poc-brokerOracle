#!/bin/sh

grunt

sed -i -e 's/\.\/shared/\.\.\/shared/g' ./dist/index.js