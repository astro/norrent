#!/bin/sh

node-waf configure || exit 1
node-waf build || exit 1
